'use strict';

var axios = require("axios")
var dojotModule = require("@dojot/dojot-module");
var config = require('./config');

class DeviceCache {

    //TODO isolate the initialization process
    constructor() {
        // initialize the cache
        this.cache = new Map();

        // initialize the kafka messenger
        this.kafkaMessenger = new dojotModule.Messenger("dms", config.kafkaMessenger);
        
        // Initializes kafka listeners ...
        console.debug("Initializing kafka messenger ...");

        this.kafkaMessenger.init().then(() => {
        console.info("... Kafka messenger was successfully initialized.");

        // read:  device conf-events for updating local cache
        console.debug("Creating r-only channel for device-manager subject...");
        this.kafkaMessenger.createChannel(config.kafkaMessenger.dojot.subjects.devices, "r");
        console.debug("... r+w channel for device-manager was created.");
        
        console.debug("Registering callbacks for device-manager device subject...");
        this.kafkaMessenger.on(config.kafkaMessenger.dojot.subjects.devices, 
            "message", (tenant, msg) => {
                try {
                    let message = JSON.parse(msg);
                    switch (message.event) {
                        case 'create':
                        this._handle_create_event(tenant, message);
                        break;
                        case 'update':
                        this._handle_update_event(tenant, message);
                        break;
                        case 'remove':
                        this._handle_remove_event(tenant, message);
                        break;
                        default:
                        console.warn(`Unexpected device-manager event: ${message.event}. Discarding ...`)
                    }
                }
                catch (error) {
                    console.warn(`Invalid device-manager event: ${error.message}. Discarding ...`);
                }
            });

        // Initialize cache with existing devices
        this._init_cache();

        }).catch(error => {
            console.error(`Failed to initialize kafka messenger. Error ${error}. Exiting...`);
            process.exit(1);
        });
    }

    has(tenant, deviceId){
        return this.cache.has(`${tenant}:${deviceId}`);
    }

    get(tenant, deviceId){
        return this.cache.get(`${tenant}:${deviceId}`);
    }

    _handle_create_event(tenant, message) {
        console.debug('Handling device create event ...');
        let _protocol = null;
        let _url = null;
        for(let template in message.data.attrs) {
            for(let attr of message.data.attrs[template]) {
                if (attr.label.toUpperCase() === 'PROTOCOL' &&
                attr.static_value.toUpperCase() === 'RTSP') {
                    _protocol = 'rtsp';
                }
                else if (attr.label.toUpperCase() === 'RTSP_URL') {
                    _url = attr.static_value;
                }
                if(_protocol && _url) {
                    this.cache.set(`${tenant}:${message.data.id}`,
                    {protocol: _protocol, url: _url});
                    console.debug(`Added ${tenant}:${message.data.id} to cache.`);
                    //TODO: notify through callbacks
                    return;
                }
            }
        }
        return;
    }

    _handle_update_event(tenant, message) {
        console.log('Handling device update event ...');
        let _protocol = null;
        let _url = null;
        for(const template in message.data.attrs) {
            for(const attr of message.data.attrs[template]) {
                if (attr.label.toUpperCase() === 'PROTOCOL' &&
                attr.static_value.toUpperCase() === 'RTSP') {
                    _protocol = 'rtsp';
                }
                else if (attr.label.toUpperCase() === 'RTSP_URL') {
                    _url = attr.static_value;
                }
                if(_protocol && _url) {
                    this.cache.set(`${tenant}:${message.data.id}`,
                    {protocol: _protocol, url: _url});
                    console.debug(`Updated ${tenant}:${message.data.id} in cache.`);
                    //TODO: notify through callbacks                    
                    return;
                }
            }
        }

        if(this.cache.has(`${tenant}:${message.data.id}`)) {
            this.cache.delete(`${tenant}:${message.data.id}`);
            console.debug(`Removed ${tenant}:${message.data.id} from cache.`);
            //TODO: notify through callbacks                    
        }
        return;
    }

    _handle_remove_event(tenant, message) {
        console.log('Handling device remove event ...');
        if(this.cache.has(`${tenant}:${message.data.id}`)) {
            this.cache.delete(`${tenant}:${message.data.id}`);
            console.debug(`Removed ${tenant}:${message.data.id} from cache.`);
            //TODO: notify through callbacks                    
        }
        return;
    }

    _init_cache() {
        console.debug('Initializing cache ...');
        for (const tenant of this.kafkaMessenger.tenants) {
            let url = `${config.deviceManager.url}/device`;
            let headers = { authorization: `Bearer ${dojotModule.Auth.getManagementToken(tenant)}`};
            let method = "get";
            //TODO: handle pagination 
            axios({url, headers, method}).then(response => {
                for(const device of response.data.devices) {
                    let _protocol = null;
                    let _url = null;
                    for(const template in device.attrs) {
                        for(const attr of device.attrs[template]) {
                            if (attr.label.toUpperCase() === 'PROTOCOL' &&
                            attr.static_value.toUpperCase() === 'RTSP') {
                                _protocol = 'rtsp';
                            }
                            else if (attr.label.toUpperCase() === 'RTSP_URL') {
                                _url = attr.static_value;
                            }
                            if(_protocol && _url) {
                                console.debug(`Adding ${tenant}:${device.id} to cache.`);
                                this.cache.set(`${tenant}:${device.id}`,
                                {protocol: _protocol, url: _url});                   
                                break;
                            }
                        }
                        if(_protocol && _url) {
                            break;
                        }
                    }
                }
            }).catch(error => {
                console.warn(`Failed to get devices from tenant ${tenant}. Error ${error}`);
            });
        }
    }
}

module.exports = {
    DeviceCache: DeviceCache   
};