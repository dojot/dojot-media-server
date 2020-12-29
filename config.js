"use strict";

module.exports = {

    'deviceManager': {
        url: process.env.DEVICE_MANAGER_HOST || "http://device-manager:5000"
    },

    'kurento': {
        ws_uri: process.env.KURENTO_WS || "ws://kurento:8888/kurento"
    },

    'kafkaMessenger' : {
        kafka: {
            producer: {
                "metadata.broker.list": process.env.KAFKA_HOSTS || "kafka:9092",
                "compression.codec": "gzip",
                    "retry.backoff.ms": 200,
                    "message.send.max.retries": 10,
                    "socket.keepalive.enable": true,
                    "queue.buffering.max.messages": 100000,
                    "queue.buffering.max.ms": 100,
                    "batch.num.messages": 1000000,
                    "dr_cb": true
                },
        
                consumer: {
                    "group.id": process.env.KAFKA_GROUP_ID || "flowbroker",
                    "metadata.broker.list": process.env.KAFKA_HOSTS || "kafka:9092"
                }
            },
            databroker: {
              host: process.env.DATA_BROKER_URL || "http://data-broker",
            },
            auth: {
              host: process.env.AUTH_URL || "http://auth:5000",
            },
            deviceManager: {
              host: process.env.DEVICE_MANAGER_URL || "http://device-manager:5000",
            },
            dojot: {
              managementService: process.env.DOJOT_SERVICE_MANAGEMENT || "dojot-management",
              subjects: {
                tenancy: process.env.DOJOT_SUBJECT_TENANCY || "dojot.tenancy",
                devices: process.env.DOJOT_SUBJECT_DEVICES || "dojot.device-manager.device",
                deviceData: process.env.DOJOT_SUBJECT_DEVICE_DATA || "device-data"
              }
            }
        }

};
