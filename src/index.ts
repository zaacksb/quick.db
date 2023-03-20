import { set, get, unset } from "lodash";
import { IDriver } from "./drivers/IDriver";
import { SqliteDriver } from "./drivers/SqliteDriver";

export { IDriver } from "./drivers/IDriver";
export { MySQLDriver } from "./drivers/MySQLDriver";
export { SqliteDriver } from "./drivers/SqliteDriver";

export interface IQuickDBOptions {
    table?: string;
    filePath?: string;
    driver?: IDriver;
}

export class QuickDB {
    driver: IDriver;
    tableName: string;
    options: IQuickDBOptions;
    private prepared!: Promise<any>;

    constructor(options: IQuickDBOptions = {}) {
        options.table ??= "json";
        options.filePath ??= "json.sqlite";
        options.driver ??= new SqliteDriver(options.filePath);

        this.options = options;
        this.driver = options.driver;
        this.tableName = options.table;

        this.prepared = this.driver.prepare(this.tableName);
    }

    private async addSubtract(
        key: string,
        value: number,
        sub = false
    ): Promise<number> {
        if (typeof key != "string")
            throw new Error("First argument (key) needs to be a string");

        if (value == null) throw new Error("Missing second argument (value)");

        let currentNumber = await this.get<number>(key);

        if (currentNumber == null) currentNumber = 0;
        if (typeof currentNumber != "number") {
            try {
                currentNumber = parseFloat(currentNumber as string);
            } catch (_) {
                throw new Error(
                    `Current value with key: (${key}) is not a number and couldn't be parsed to a number`
                );
            }
        }

        sub ? (currentNumber -= value) : (currentNumber += value);
        return this.set<number>(key, currentNumber);
    }

    private async getArray<T>(key: string): Promise<T[]> {
        const currentArr = (await this.get<T[]>(key)) ?? [];

        if (!Array.isArray(currentArr))
            throw new Error(`Current value with key: (${key}) is not an array`);

        return currentArr;
    }

    async all(): Promise<{ id: string; value: any }[]> {
        return this.driver.getAllRows(this.tableName);
    }

    async get<T>(key: string): Promise<T | null> {
        if (typeof key != "string")
            throw new Error("First argument (key) needs to be a string");

        if (key.includes(".")) {
            const keySplit = key.split(".");
            const [result] = await this.driver.getRowByKey<T>(
                this.tableName,
                keySplit[0]
            );
            return get(result, keySplit.slice(1).join("."));
        }

        const [result] = await this.driver.getRowByKey<T>(this.tableName, key);
        return result;
    }

    async set<T>(key: string, value: any): Promise<T> {
        if (typeof key != "string")
            throw new Error("First argument (key) needs to be a string");
        if (value == null) throw new Error("Missing second argument (value)");

        if (key.includes(".")) {
            const keySplit = key.split(".");
            const [result, exist] = await this.driver.getRowByKey(
                this.tableName,
                keySplit[0]
            );
            // If it's not an instance of an object (rewrite it)
            let obj: object;
            if (result instanceof Object == false) {
                obj = {};
            } else {
                obj = result as object;
            }

            const valueSet = set<T>(
                obj ?? {},
                keySplit.slice(1).join("."),
                value
            );
            return this.driver.setRowByKey(
                this.tableName,
                keySplit[0],
                valueSet,
                exist
            );
        }

        const exist = (await this.driver.getRowByKey(this.tableName, key))[1];
        return this.driver.setRowByKey(this.tableName, key, value, exist);
    }

    async has(key: string): Promise<boolean> {
        return (await this.get(key)) != null;
    }

    async delete(key: string): Promise<number> {
        if (typeof key != "string")
            throw new Error("First argument (key) needs to be a string");

        if (key.includes(".")) {
            const keySplit = key.split(".");
            const obj = (await this.get<any>(keySplit[0])) ?? {};
            unset(obj, keySplit.slice(1).join("."));
            return this.set(keySplit[0], obj);
        }

        return this.driver.deleteRowByKey(this.tableName, key);
    }

    async deleteAll(): Promise<number> {
        return this.driver.deleteAllRows(this.tableName);
    }

    async add(key: string, value: number): Promise<number> {
        return this.addSubtract(key, value);
    }

    async sub(key: string, value: number): Promise<number> {
        return this.addSubtract(key, value, true);
    }

    async push<T>(key: string, value: any | any[]): Promise<T[]> {
        if (typeof key != "string")
            throw new Error("First argument (key) needs to be a string");
        if (value == null) throw new Error("Missing second argument (value)");

        let currentArr = await this.getArray<T>(key);

        if (Array.isArray(value)) currentArr = currentArr.concat(value);
        else currentArr.push(value);

        return this.set(key, currentArr);
    }

    async pull<T>(
        key: string,
        value: any | any[] | ((data: any) => boolean)
    ): Promise<T[]> {
        if (typeof key != "string")
            throw new Error("First argument (key) needs to be a string");
        if (value == null) throw new Error("Missing second argument (value)");

        let currentArr = await this.getArray<T>(key);

        if (!Array.isArray(value) && typeof value != "function")
            value = [value];

        currentArr = currentArr.filter((...params) =>
            Array.isArray(value)
                ? !value.includes(params[0])
                : !value(...params)
        );

        return this.set(key, currentArr);
    }

    table(table: string): QuickDB {
        if (typeof table != "string")
            throw new Error("First argument (table) needs to be a string");

        const options = { ...this.options };

        options.table = table;
        options.driver = this.options.driver;
        return new QuickDB(options);
    }

    async tableAsync(table: string): Promise<QuickDB> {
        const db = this.table(table);
        await db.prepared;

        return db;
    }
}