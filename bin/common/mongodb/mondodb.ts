import { MongoClient } from 'mongodb';

export class MongoDB {
    private client: MongoClient;
    private dbName: string;

    constructor(uri: string, dbName: string) {
        this.client = new MongoClient(uri);
        this.dbName = dbName;
    }

    async connect(): Promise<void> {
        try {
            await this.client.connect();
        } catch (error) {
            throw error;
        }
    }

    getDb() {
        return this.client.db(this.dbName);
    }

    async insertDocument(collectionName: string, document: object): Promise<void> {
        const db = this.getDb();
        const collection = db.collection(collectionName);
        try {
            await collection.insertOne(document);
        } catch (error) {
            throw error;
        }
    }

    async findDocuments(collectionName: string, query: object = {}): Promise<any[]> {
        const db = this.getDb();
        const collection = db.collection(collectionName);
        try {
            const documents = await collection.find(query).toArray();
            return documents;
        } catch (error) {
            throw error;
        }
    }

    async updateDocument(collectionName: string, filter: object, update: object): Promise<void> {
        const db = this.getDb();
        const collection = db.collection(collectionName);
        try {
            await collection.updateOne(filter, { $set: update });
        } catch (error) {
            throw error;
        }
    }

    async deleteDocument(collectionName: string, filter: object): Promise<void> {
        const db = this.getDb();
        const collection = db.collection(collectionName);
        try {
            await collection.deleteOne(filter);
        } catch (error) {
            throw error;
        }
    }

    async close(): Promise<void> {
        await this.client.close();
    }
}