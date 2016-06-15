import Bluebird     from "bluebird";
import MongoDB      from "mongodb";
import { Writable } from "stream";

Bluebird.promisifyAll(MongoDB.MongoClient);
Bluebird.promisifyAll(MongoDB.Collection.prototype);

let config = {};
let conn   = {};
let batch  = [];

function streamToMongoDB(options) {
    setupConfig(options);
    return writableStream();
}

function connect() {
    console.log("connecting..")
    return new Bluebird((resolve, reject) => {
        MongoDB.MongoClient.connectAsync(config.dbURL)
            .then(db => {
                conn.db = db;
                conn.collection = conn.db.collection(config.collection);

                console.log("coneceted!")
                resolve();
            })
            .catch(error => reject(error));
    });
}

function insertToMongo(records) {
    return new Bluebird((resolve, reject) => {
        if(batch.length) {
            // console.log("inseting to mongo!!", records)
            conn.collection.insertAsync(records, config.insertOptions)
                .then(resolve)
                .catch(error => reject(error));
        } else {
            resolve();
        }
    });
}

function prepareInsert(record) {
    return new Bluebird(resolve => {
        batch.push(record);

        if(batch.length === config.batchSize) {
            insertToMongo(batch)
                .then(() => {
                    resetBatch();
                    resolve();
                });
        } else {
            resolve();
        }
    });
}

function writableStream() {
    const writableStream = new Writable({
        objectMode: true,
        write: function(record, encoding, next) {
            if(conn.db) {
                // console.log("with connection...")
                prepareInsert(record).then(next);
            } else {
                // console.log("no connn connection...")

                connect().then(() => {
                    prepareInsert(record).then(next);
                });
            }
        }
    });

    writableStream.on("finish", () => {
        // insert remainder of the batch that did not fit into the batchSize
        console.log("finished!");
        insertToMongo(batch).then(() => {
            // garbage collect the used up batch
            resetBatch();
            conn.db.close();
            // resetConn();

        });
    });

    return writableStream;
}

function setupConfig(options){
    config = options;
    const defaultConfiguration = defaultConfig();

    console.log(options)

    Object.keys(defaultConfiguration).map(configKey => {
        if(!config[configKey]) {
            config[configKey] = defaultConfiguration[configKey];
        }
    });

    // if(config.batchSize <= 0) {
    //     throw "'batchSize' must be a positive value";
    // }
}

function defaultConfig() {
    return {
        batchSize : 1,
        insertOptions : { w : 1 }
    };
}

function resetConn() {
    conn = {};
}

function resetBatch() {
    batch = [];
}

module.exports = {
    streamToMongoDB
};