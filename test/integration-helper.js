var webdriver = require('selenium-webdriver');
var Server = require('ircdjs').Server;

module.exports = {

  startServer: function(){
    var server = new Server();
    server.config = {
      network:  "ircn",
      hostname: "localhost",
      serverDescription: "A Node IRC daemon",
      serverName: "server1",
      port: 6667,
      whoWasLimit: 10000,
      idleTimeout: 60,
      opers: {},
      channels: {
        '#channel1': { topic: "Welcome to Channel 1" },
        '#channel2': { topic: "Second Channel" }
      }
    }
    server.start();
    server.createDefaultChannels();
    return server;
  },

  createBrowser: function(){
    return new webdriver.Builder()
      .usingServer('http://localhost:9515')
      .withCapabilities({
        chromeOptions: {
          binary: 'Backchat.app/Contents/MacOS/Electron'
        }
      })
      .forBrowser('electron')
      .build();
  }

}