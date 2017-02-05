module.exports = function(HAPnode, config)
{
    var module  = {};
    var debug = HAPnode.debug;
      module.latest = function(){},
      module.cacheStatus = function(){
        debug('Caching status...');
        HAPnode.request({
            method:'GET',
            uri: 'http://'+config.veraIP+':3480/data_request?id=sdata'
        }).then(function(status){
          module.cache = JSON.parse(status);
        })
      },

      module.getVariable = function(id, property){
        // console.log('cache is', module.cache);
        if (!module.cache){
          return false;
        }
        device = module.cache.devices.find(function(device, index){
          return device.id === id;
        });
        return device[property];
      },

      module.getVeraInfo = function()
      {
          var url = "http://" + config.veraIP + ":3480/data_request?id=lu_sdata";
          return HAPnode.request(
              {
                  method: 'GET',
                  uri: url,
                  json: true
              }).then(function (data) {
                  HAPnode.debug('Using url: '+url);
                  devices = {};
                  if(typeof data === 'object')
                  {
                      data.devices.forEach(function(device)
                      {
                          if(typeof devices[device.room] ==='undefined')
                          {
                              devices[device.room] = [];
                          }

                          devices[device.room].push(device);
                      });

                      return({'rooms': data.rooms,'devices_by_room': devices, 'devices_full_list': data.devices, 'scenes': data.scenes, 'temperature': data.temperature});
                  }
                  else
                  {
                      return(null);
                  }
          }.bind(this)).catch(function (err) {
              HAPnode.debug("Request error:"+err);
          });
      },

      module.processall = function(verainfo)
      {
          accessories = module.processdevices(verainfo.devices_full_list, verainfo);

          if(typeof HAPnode.return === 'undefined')
          {
              accessories.forEach(function(accessory)
              {
                  if(typeof config.ignoredevices !== 'undefined' && config.ignoredevices && config.ignoredevices.constructor === Array)
                  {
                      if(config.ignoredevices.indexOf(accessory.deviceid) >= 0)
                      {
                          HAPnode.debug("Ignore Device "+accessory.deviceid+"-"+ accessory.displayName);
                          return;
                      }
                  }

                  var Port = config.happort + 100 +(accessory.deviceid*2);

                  accessory.publish({
                      port: Port,
                      username: accessory.username,
                      pincode: accessory.pincode
                  });
              });
          }
          else
          {
              returnlist = [];
              accessories.forEach(function(accessory)
              {
                  if(typeof config.ignoredevices !== 'undefined' && config.ignoredevices && config.ignoredevices.constructor === Array)
                  {
                      if(config.ignoredevices.indexOf(accessory.deviceid) >= 0)
                      {
                          console.log("Ignore Device "+accessory.deviceid+": "+ accessory.displayName);
                          return;
                      }
                  }

                  console.log("Process Device "+accessory.deviceid+": "+ accessory.displayName);
                  returnlist.push(accessory);
              });

              return returnlist;
          }
      },

      module.processrooms = function(verainfo)
      {
          verainfo.rooms.forEach(function(room)
          {
              if(typeof config.ignorerooms !== 'undefined' && config.ignorerooms && config.ignorerooms.constructor === Array)
              {
                  if(typeof config.ignorerooms[room.id] !== 'undefined')
                  {
                      HAPnode.debug("Ignore Room "+room.id+"-"+room.name);
                      return;
                  }
              }

              // Start by creating our Bridge which will host all loaded Accessories
              var bridge = new HAPnode.Bridge(room.name, HAPnode.uuid.generate(room.name));

              // Listen for bridge identification event
              bridge.on('identify', function(paired, callback)
              {
                  HAPnode.debug("Node Bridge identify");
                  callback(); // success
              });

              HAPnode.debug('Start room: %s', room.name);
              if(typeof verainfo.devices_by_room[room.id] !== "undefined")
              {
                  accessories = module.processdevices(verainfo.devices_by_room[room.id], verainfo);
              }

              if(typeof accessories === "object")
              {
                  // Add them all to the bridge
                  accessories.forEach(function(accessory)
                  {
                      if(typeof accessory === 'object')
                      {
                          if(typeof config.ignoredevices !== 'undefined' && config.ignoredevices && config.ignoredevices.constructor === Array)
                          {
                              if(config.ignoredevices.indexOf(accessory.deviceid) >= 0)
                              {
                                  HAPnode.debug("Ignore Device "+accessory.deviceid+"-"+ accessory.displayName);
                                  return;
                              }
                          }
                          bridge.addBridgedAccessory(accessory);
                      }
                  });

                  var Port = config.happort + (room.id*2);
                  HAPnode.debug('------ Pinconde: %s',config.pincode);
                  // Publish the Bridge on the local network.

                  bridge.publish({
                    username:     module.genMac('roomID:'+config.cardinality+':'+room.id),
                    port:         Port,
                    pincode:      config.pincode,
                    category:     HAPnode.Accessory.Categories.OTHER
                  });
              }
          });
      },

      module.processdevices = function(list, verainfo)
      {
          var accessories = [];

          list.forEach(function(device)
          {
              HAPnode.debug(device.name + ' ID:' +device.id);
              switch (device.category)
              {
                  case 2: // Dimmable Light:
                          if (config.includeRGB && device.subcategory == 4){
                              var ColoredLight = require("./types/color_light.js")(HAPnode,config,module);
                              HAPnode.debug('------ Coloured light Added: %s', device.name + ' ID:' +device.id);
                              accessories.push(ColoredLight.newDevice(device));
                          // Specifically looking the word "fan" in the device name, very shaky assumption
                          } else if ((device !== null) && (device !== undefined) && (typeof(device.name) === 'string') && (device.name.toLowerCase().includes("fan"))){
                              var Fan    = require("./types/fan.js")(HAPnode,config,module);
                              HAPnode.debug('------ Fan Added: %s', device.name + ' ID:' +device.id);
                              accessories.push(Fan.newDevice(device));
                          } else {
                              var DimmableLight    = require("./types/dimmer.js")(HAPnode,config,module);
                              HAPnode.debug('------ Dimmer light Added: %s', device.name + ' ID:' +device.id);
                              accessories.push(DimmableLight.newDevice(device));
                          }
                      break;

                  case 3: // Switch
                          if(device.subcategory > 0)
                          {
                              console.log('we have a switch')
                              var Switch = require("./types/switch.js")(HAPnode,config,module);
                              accessories.push(Switch.newDevice(device));
                              HAPnode.debug('------ Switch Added: %s', device.name + ' ID:' +device.id);
                          }
                          else
                          {
                              var Lightbulb = require("./types/light.js")(HAPnode,config,module);
                              accessories.push(Lightbulb.newDevice(device));
                              HAPnode.debug('------ Lightbulb Added: %s', device.name + ' ID:' +device.id);
                          }
                      break;

                  case 4: // Security Sensor
                      //Deactivated for the moment
  //                        if(config.includesensor)
  //                        {
  //                            var SecuritySensor = require("./types/securitysense.js")(HAPnode,config,module);
  //                            accessories.push(SecuritySensor.newDevice(device));
  //                            HAPnode.debug('------ Security Sensor Added: %s', device.name + ' ID:' +device.id);
  //                        }
                      break;

                  case 5:
                      if(config.includethermostat){
                          var Thermostat            = require("./types/thermostat.js")(HAPnode,config,module);
                          HAPnode.debug('------ Thermostat Added: %s', device.name + ' ID:' +device.id);
                          accessories.push(Thermostat.newDevice(device, verainfo.temperature));
                      };
                      break;

                  case 7: // Door lock
                          var Lock            = require("./types/lock.js")(HAPnode,config,module);
                          HAPnode.debug('------ Lock Added: %s', device.name + ' ID:' +device.id);
                          accessories.push(Lock.newDevice(device));
                      break;

                  case 8: // Window covering
                          HAPnode.debug('------ Window covering found: %s', device.name + ' ID:' +device.id);
                          var wc = require("./types/windowcovering.js")(HAPnode,config,module);
                          accessories.push(wc.newDevice(device));
                          HAPnode.debug('------ Window covering Added: %s', device.name + ' ID:' +device.id);
                      break;

                  case 17: // Temp sensor
                          if(config.includesensor)
                          {
                              var Tempsense       = require("./types/tempsense.js")(HAPnode,config,module);
                              HAPnode.debug('------ Temp sensor Added: %s', device.name + ' ID:' +device.id);
                              accessories.push(Tempsense.newDevice(device));
                          }
                      break;
              }
          });

          accessories = module.processscenes(accessories, verainfo.scenes);

          return accessories;
      },

      module.processscenes = function(accessories, list)
      {
          list.forEach(function(scene)
          {
              var Scene = require("./types/scene.js")(HAPnode,config,module);
              accessories.push(Scene.newScene(scene));
              HAPnode.debug('------ Scene Added: %s', scene.name + ' ID:' +scene.id);
          });

          return accessories;
      },
      module.remoteRequest = function(url, params, callback){
          debug("Requesting: %s", url);
          // HAPnode.request.debug = true
          return HAPnode.request({
              method:'GET',
              uri: url,
              qs: params,
              resolveWithFullResponse: true
          }).then(function(response){
            // debug('Response was: ', response);
            if(callback){callback.bind(this);}
            return response.body;
          }).catch(function(e){
              console.log(e);
              debug(e.error);
              debug(e.options);
              debug(e.response);
          });
      },
      module.executeAction = function(params){
          var url = 'http://'+config.veraIP+':3480/data_request?id=lu_action&output_format=json'
          var callback = function(){};
          return this.remoteRequest(url, params, callback)
            .then(function(response){
              try{
                json = JSON.parse(response);
                return json
              }catch(e){
                return response;
              }
            });
      },
      module.genMac = function genMac(str)
      {
          var hash = HAPnode.hashing('md5').update(str).digest("hex").toUpperCase();
          return hash[0] + hash[1] + ":" +
                 hash[2] + hash[3] + ":" +
                 hash[4] + hash[5] + ":" +
                 hash[6] + hash[7] + ":" +
                 hash[8] + hash[9] + ":" +
                 hash[10] + hash[11];
      };

    setInterval(function() {

        module.cacheStatus();

    }, 3000);

    return module;
};
