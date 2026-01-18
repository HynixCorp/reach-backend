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

    /**
     * Ping the database to check connectivity
     * @returns Promise that resolves if ping is successful
     */
    async ping(): Promise<boolean> {
        try {
            const db = this.getDb();
            await db.command({ ping: 1 });
            return true;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Get database statistics
     * @returns Database stats including collection count
     */
    async getStats(): Promise<{ collections: number; dataSize: number; storageSize: number }> {
        try {
            const db = this.getDb();
            const stats = await db.stats();
            return {
                collections: stats.collections || 0,
                dataSize: stats.dataSize || 0,
                storageSize: stats.storageSize || 0,
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * List all collections in the database
     * @returns Array of collection names
     */
    async listCollections(): Promise<string[]> {
        try {
            const db = this.getDb();
            const collections = await db.listCollections().toArray();
            return collections.map(c => c.name);
        } catch (error) {
            throw error;
        }
    }

    async insertDocument(collectionName: string, document: object): Promise<any> {
        const db = this.getDb();
        const collection = db.collection(collectionName);
        try {
            return await collection.insertOne(document);
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

    async updateDocuments(collectionName: string, filter: object, update: object): Promise<void> {
        const db = this.getDb();
        const collection = db.collection(collectionName);
        try {
            const updateOperation = Object.keys(update).some(key => key.startsWith('$')) 
                ? update 
                : { $set: update };
            
            await collection.updateMany(filter, updateOperation);
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

    async deleteDocuments(collectionName: string, filter: object): Promise<void> {
        const db = this.getDb();
        const collection = db.collection(collectionName);
        try {
            await collection.deleteMany(filter);
        } catch (error) {
            throw error;
        }
    }

    async close(): Promise<void> {
        await this.client.close();
    }
}