# reach-backend
Backend service for https://api.reachsdk.online/


## How to run

1. Clone the repository and run `npm i`
2. Copy `.env.sample` onto `.env` and fill in the values
3. Run `npx ts-node server.ts` to start the server


## Building the docker image

1. Use `docker build -t reach-backend:local .` to build the image.
2. Run the image using 
```sh
docker run -p 3000:3000 \
  -e PORT=3000 \
  -e DB_URI=mongodb://admin:password@40.233.24.185:27017/ \
  -e MULTER_DIR=./files/uploads \
  -v $(pwd)/uploads:/app/files/uploads \
  reach-backend:local
```
3. Or use the example docker compose.

### File permissions:

1. Make sure the files/uploads directory has the correct permissions.
2. Run `mkdir -p ./uploads/temp && chmod -R 755 ./uploads` to make sure the container has permissions to use the files.
3. If you want to add more assets like files to the folder `files/uploads/resources`, shut down the container, upload your files, run `chmod -R 755 ./uploads`, then restart your container.