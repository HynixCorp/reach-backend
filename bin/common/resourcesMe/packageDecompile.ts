import crypto from 'crypto'
import hash from 'stable-hash'
import extract from 'extract-zip';
import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';
import { FileManifest } from '../../interfaces/manifest';

config();

function calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        try{
            const file_stream = fs.readFileSync(filePath);
            const weakHash = hash(file_stream);
            const encodedHash = Buffer.from(weakHash).toString('base64');
            const safeHash = crypto.createHash('MD5').update(encodedHash).digest('hex');
            resolve(safeHash);
        }
        catch (error: any) {
            reject(new Error(`Error calculating hash for file ${filePath}: ${error.message}`));
        }
    })
        
}

function ManifestMaker(targetDir: string): Promise<string> {
    // Helper to recursively walk directory
    function walkDir(dir: string, fileList: string[] = []): string[] {
        const files = fs.readdirSync(dir);
        files.forEach((file) => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                walkDir(filePath, fileList);
            } else {
                fileList.push(filePath);
            }
        });
        return fileList;
    }

    return new Promise(async (resolve, reject) => {
        try {
            const baseUrl = 'http://api.reachsdk.online/files/uploads/instances/packages';
            // El nombre de la instancia es el último segmento de targetDir
            const instanceName = path.basename(targetDir);
            const allFiles = walkDir(targetDir);
            const files: FileManifest[] = [];
            for (const filePath of allFiles) {
                const stats = fs.statSync(filePath);
                // Relative path for URL y para path
                const relPath = path.relative(targetDir, filePath).replace(/\\/g, "/");
                const url = `${baseUrl}/${instanceName}/${relPath}`;
                files.push({
                    url: url,
                    size: stats.size,
                    hash: await calculateFileHash(filePath),
                    path: relPath
                });
            }
            const manifestPath = path.join(targetDir, 'manifest.json');
            fs.writeFile(manifestPath, JSON.stringify(files, null, 2), (err) => {
                if (err) {
                    return reject(new Error(`Error writing manifest file: ${err.message}`));
                }
                resolve(manifestPath);
            });
        } catch (error: any) {
            return reject(new Error(`Error creating manifest: ${error.message}`));
        }
    });
}

export function reach_packageDecompile(fileName: string): Promise<any> {
    const MULTER_DIR = process.env.MULTER_DIR || './files/uploads';
    const packetPath = `${MULTER_DIR}/instances/packages/${fileName}`;
    const folderName = fileName.replace('.zip', '');
    const target = path.resolve(`${MULTER_DIR}/instances/packages/${folderName}`);

    if (!fs.existsSync(packetPath)) {
        return Promise.reject(new Error(`Package ${fileName} does not exist.`));
    }

    return new Promise(async (resolve, reject) => {
        try {
            await extract(packetPath, { dir: target })
            const manifestPath = await ManifestMaker(target);
            // Construir la ruta pública para manifestPath
            // Ejemplo: /files/uploads/instances/packages/[nombre]/manifest.json
            const publicManifestPath = `/files/uploads/instances/packages/${folderName}/manifest.json`;
            resolve({
                message: `Package ${fileName} decompiled successfully.`,
                manifestPath: publicManifestPath,
                targetDirectory: target,
                packageName: folderName
            });
        } catch (error: any) {
            reject(new Error(`Error during package decompilation: ${error.message}`));
        }
    });
}