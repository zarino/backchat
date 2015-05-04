var fs = require('fs');
var path = require('path');

var _ = require('underscore-plus');

var app = require('app');
var ipc = require('ipc');
var Menu = require('menu');
var MenuItem = require('menu-item');
var BrowserWindow = require('browser-window');

var pkgJson = require('../../package.json');
var AppMenu = require('./app-menu');
var ConnectionPool = require('./connection-pool');

var mainWindow = null;
var pool = new ConnectionPool();

app.on('ready', function() {

  var menu = new AppMenu({pkgJson: pkgJson});
  menu.attachToWindow(mainWindow);

  menu.on('application:quit', function(){
    app.quit();
  }).on('window:reload', function(){
    BrowserWindow.getFocusedWindow().reload();
  }).on('window:toggle-dev-tools', function(){
    BrowserWindow.getFocusedWindow().toggleDevTools();
  });

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600
  });
  mainWindow.openDevTools({ detach: true });
  mainWindow.loadUrl('file://' + __dirname + '/../client/index.html');
  mainWindow.on('closed', function() {
    mainWindow = null;
  }).on('blur', function(){
    mainWindow.webContents.send('window:blurred');
  }).on('focus', function(){
    mainWindow.webContents.send('window:focussed');
  });

});

app.on('window-all-closed', function() {
  app.quit();
});

ipc.on('client:ready', function(){
  getSettings(function(settings){
    mainWindow.webContents.send('server:settings', settings);
    _.each(settings.servers, function(serverSettings){
      pool.addConnection(serverSettings);
    });
  });
});

pool.on('irc:registering', function(e){
  console.log('server:connecting', JSON.stringify(e, null, 2));
  mainWindow.webContents.send('server:connecting', e);

}).on('irc:registered', function(e){
  console.log('server:connected', JSON.stringify(e, null, 2));
  mainWindow.webContents.send('server:connected', e);

}).on('irc:join', function(e){
  console.log('channel:joined', JSON.stringify(e, null, 2));
  mainWindow.webContents.send('channel:joined', e);

}).on('irc:part', function(e){
  console.log('channel:parted', JSON.stringify(e, null, 2));
  mainWindow.webContents.send('channel:parted', e);

}).on('irc:topic', function(e){
  console.log('channel:topicChanged', JSON.stringify(e, null, 2));
  mainWindow.webContents.send('channel:topicChanged', e);

}).on('irc:names', function(e){
  console.log('channel:usersListed', JSON.stringify(e, null, 2));
  mainWindow.webContents.send('channel:usersListed', e);

}).on('irc:message', function(e){
  console.log('message:sent', JSON.stringify(e, null, 2));
  mainWindow.webContents.send('message:sent', e);

}).on('irc:action', function(e){
  console.log('action:sent', JSON.stringify(e, null, 2));
  mainWindow.webContents.send('action:sent', e);

}).on('irc:changedNick', function(e){
  console.log('nick:changed', JSON.stringify(e, null, 2));
  mainWindow.webContents.send('nick:changed', e);

});

var getSettings = function getSettings(cb){
  var settingsFile = path.join(app.getPath('appData'), pkgJson.name, 'settings.json');
  fs.readFile(settingsFile, 'utf8', function(err, settingsStream) {
    if(err){
      var defaultSettingsObject = require('../templates/default-settings.json');
      fs.writeFile(settingsFile, JSON.stringify(defaultSettingsObject), function(err){
        if(err){
          throw err;
        }
        cb(defaultSettingsObject);
      });
    } else {
      var settingsObject = JSON.parse(settingsStream.toString());
      cb(settingsObject);
    }
  });
}
