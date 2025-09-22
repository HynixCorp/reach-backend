import { Collection, MongoClient, ObjectId } from 'mongodb';

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
            // Si el update ya contiene operadores de MongoDB ($push, $set, $unset, etc.), usarlo directamente
            // Si no, envolverlo en $set para mantener compatibilidad hacia atrás
            const updateOperation = Object.keys(update).some(key => key.startsWith('$')) 
                ? update 
                : { $set: update };
            
            await collection.updateOne(filter, updateOperation);
        } catch (error) {
            throw error;
        }
    }

    createObjectId(id?: string | ObjectId): ObjectId {
        if (!id) {
            return new ObjectId();
        }

        if (id instanceof ObjectId) {
            return id;
        }

        if (typeof id === 'string') {
            const hex24 = /^[0-9a-fA-F]{24}$/;
            if (hex24.test(id)) {
                return new ObjectId(id);
            }
        }

        return new ObjectId();
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