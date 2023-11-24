import { existsSync, readFileSync } from "fs";
import { readFile } from "fs/promises";
import writeFile from "write-file-atomic";
import AsyncLock from "async-lock";

import { MemoryDriver } from "./MemoryDriver";

export type DataLike<T = any> = { id: string; value: T };

/**
 * JSONDriver
 * @example
 * ```ts
 * const { JSONDriver } = require("quick.db/JSONDriver");
 * const jsonDriver = new JSONDriver();
 *
 * const db = new QuickDB({
 *  driver: jsonDriver
 * });
 * await db.init(); // Always needed!!!
 * await db.set("test", "Hello World");
 * console.log(await db.get("test"));
 * ```
 **/
export class JSONDriver extends MemoryDriver {
    private lock: AsyncLock;
    private replacer: ((this: any, key: string, value: any) => any) | undefined;
    private space: string | number | undefined;
    public constructor(
        public path = "./quickdb.json",
        asyncLockOptions?: AsyncLock.AsyncLockOptions,
        replacer?: (this: any, key: string, value: any) => any,
        space?: string | number | undefined
    ) {
        super();
        this.replacer = replacer;
        this.space = space;
        this.lock = new AsyncLock(asyncLockOptions);
        // synchronously load contents before initializing
        this.loadContentSync();
    }

    public loadContentSync(): void {
        if (existsSync(this.path)) {
            const contents = readFileSync(this.path, { encoding: "utf-8" });

            try {
                const data = JSON.parse(contents);
                for (const table in data) {
                    const store = this.getOrCreateTable(table);
                    data[table].forEach((d: DataLike) =>
                        store.set(d.id, d.value)
                    );
                }
            } catch {
                throw new Error("Database malformed");
            }
        } else {
            writeFile.sync(this.path, "{}");
        }
    }

    public async loadContent(): Promise<void> {
        if (existsSync(this.path)) {
            const contents = await readFile(this.path, { encoding: "utf-8" });

            try {
                const data = JSON.parse(contents);
                for (const table in data) {
                    const store = this.getOrCreateTable(table);
                    data[table].forEach((d: DataLike) =>
                        store.set(d.id, d.value)
                    );
                }
            } catch {
                throw new Error("Database malformed");
            }
        } else {
            await writeFile(this.path, "{}");
        }
    }

    public async export(): Promise<Record<string, DataLike[]>> {
        const val: Record<string, DataLike[]> = {};

        for (const tableName of this.store.keys()) {
            val[tableName] = await this.getAllRows(tableName);
        }

        return val;
    }

    public async snapshot(): Promise<void> {
        const data = await this.export();
        return new Promise((reoslve) => {
            this.lock
                .acquire("writedb", async (cb) => {
                    await writeFile(
                        this.path,
                        JSON.stringify(data, this.replacer, this.space)
                    );
                    cb(null, true);
                })
                .then(() => {
                    reoslve();
                });
        });
    }

    public override async deleteAllRows(table: string): Promise<number> {
        const val = super.deleteAllRows(table);
        await this.snapshot();
        return val;
    }

    public override async deleteRowByKey(
        table: string,
        key: string
    ): Promise<number> {
        const val = super.deleteRowByKey(table, key);
        await this.snapshot();
        return val;
    }

    public override async setRowByKey<T>(
        table: string,
        key: string,
        value: any,
        update: boolean
    ): Promise<T> {
        const val = super.setRowByKey<T>(table, key, value, update);
        await this.snapshot();
        return val;
    }
}
