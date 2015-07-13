var fse = require('fs-extra');
var path = require('path');

var _ = require('underscore-plus');

var app = require('app');
var ipc = require('ipc');
var shell = require('shell');
var Menu = require('menu');
var MenuItem = require('menu-item');
var BrowserWindow = require('browser-window');

var pkgJson = require('../package.json');
var AppMenu = require('./app-menu');
var ConnectionPool = require('./connection-pool');

var mainWindow = null;
var pool = new ConnectionPool();

var DEBUG = process.env.hasOwnProperty('BACKCHAT_DEBUG');

if(DEBUG){
  console.log('** Running Backchat in DEBUG mode **');
}

var loggingDirectory = path.join(app.getPath('userData'), 'Logs');

app.on('ready', function() {

  var menu = new AppMenu({pkgJson: pkgJson});
  menu.attachToWindow(mainWindow);

  menu.on('application:quit', function(){
    app.quit();
  }).on('window:reload', function(){
    BrowserWindow.getFocusedWindow().reload();
  }).on('window:toggle-dev-tools', function(){
    BrowserWindow.getFocusedWindow().toggleDevTools();
  }).on('application:showLogsForCurrentChannel', function(){
    mainWindow.webContents.send('application:getActiveChannel', {
      ipcCallback: 'client:showLogsForChannel'
    });
  });

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600
  });
  // mainWindow.openDevTools({ detach: true });
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

}).on('client:sendMessage', function(e, args){
  console.log('client:sendMessage', JSON.stringify(args, null, 2));

  // User wants to send an IRC command like /me, /away, or /whois
  if(args.messageText.indexOf('/') == 0){
    var messageWords = args.messageText.split(' ');
    var messageCommand = messageWords[0].toLowerCase();
    var messageWithoutFirstWord = _.rest(messageWords, 1).join(' ');

    // ME
    if (messageCommand == '/me'){
      pool.getConnection(args.serverUrl).action(
        args.toUserOrChannel,
        messageWithoutFirstWord
      );

    // AWAY and AWAY <msg>
    } else if(messageCommand == '/away'){
      if(messageWords.length == 1){
        pool.getConnection(args.serverUrl).send('AWAY');
      } else {
        pool.getConnection(args.serverUrl).send('AWAY', messageWithoutFirstWord);
      }

    // Something else, just try your best
    } else {
      var ircCommand = messageCommand.replace('/', '').toUpperCase();
      pool.getConnection(args.serverUrl).send(
        ircCommand,
        messageWithoutFirstWord
      );
    }

  // No slash, so it must be just a normal message
  } else {
    pool.getConnection(args.serverUrl).say(
      args.toUserOrChannel,
      args.messageText
    );
  }

}).on('client:refreshUserStatusesForChannel', function(e, args){
  pool.getConnection(args.serverUrl).send('WHO', args.channelName);

}).on('client:refreshUserStatus', function(e, args){
  pool.getConnection(args.serverUrl).send('WHOIS', args.nick);

}).on('client:incrementDockBadge', function(){
  var currentValue = 0;
  if( _.isFinite(app.dock.getBadge()) ){
    currentValue = parseFloat(app.dock.getBadge());
  }
  var newValueAsString = '' + (1 + currentValue);
  app.dock.setBadge(newValueAsString);

}).on('client:clearDockBadge', function(){
  app.dock.setBadge('');

}).on('client:bounceDock', function(){
  app.dock.bounce('informational');

}).on('client:showLogsForChannel', function(e, args){
  var isoDate = args.updatedTimestamp.substring(0,10);
  var logFile = path.join(loggingDirectory, args.serverUrl, args.channelName, isoDate + '.txt');
  shell.showItemInFolder(logFile);

});

pool.on('irc:registering', function(e){
  e.timestamp = ISOTimestamp();
  console.log('server:connecting', JSON.stringify(e, null, 2));
  mainWindow.webContents.send('server:connecting', e);

}).on('irc:registered', function(e){
  e.timestamp = ISOTimestamp();
  console.log('server:connected', JSON.stringify(e, null, 2));
  mainWindow.webContents.send('server:connected', e);

}).on('irc:joining', function(e){
  e.timestamp = ISOTimestamp();
  console.log('channel:joining', JSON.stringify(e, null, 2));
  mainWindow.webContents.send('channel:joining', e);

}).on('irc:join', function(e){
  e.timestamp = ISOTimestamp();
  console.log('channel:joined', JSON.stringify(e, null, 2));
  mainWindow.webContents.send('channel:joined', e);
  saveToLog('channel:joined', e);

}).on('irc:part', function(e){
  e.timestamp = ISOTimestamp();
  console.log('channel:parted', JSON.stringify(e, null, 2));
  mainWindow.webContents.send('channel:parted', e);
  saveToLog('channel:parted', e);

}).on('irc:topic', function(e){
  e.timestamp = ISOTimestamp();
  console.log('channel:topicChanged', JSON.stringify(e, null, 2));
  mainWindow.webContents.send('channel:topicChanged', e);
  saveToLog('channel:topicChanged', e);

}).on('irc:names', function(e){
  e.timestamp = ISOTimestamp();
  console.log('channel:usersListed', JSON.stringify(e, null, 2));
  mainWindow.webContents.send('channel:usersListed', e);
  saveToLog('channel:usersListed', e);

}).on('irc:message', function(e){
  e.timestamp = ISOTimestamp();
  console.log('message:sent', JSON.stringify(e, null, 2));
  var eventType = 'message:sent';

  // Annoyingly, it seems sometimes IRC actions come through as messages.
  // We can detect them by checking the content of the message.
  if(e.messageText.indexOf('\u0001ACTION') == 0){
    e.actionText = e.messageText.replace(/^\u0001ACTION\s*(.+)\u0001$/, '$1');
    eventType = 'action:sent';
  }

  // Swap the "channel name" round if this is an incoming direct message.
  if(e.toUserOrChannel == e.myNick){
    e.toUserOrChannel = e.fromUser;
  }

  mainWindow.webContents.send(eventType, e);
  saveToLog(eventType, e);

}).on('irc:action', function(e){
  e.timestamp = ISOTimestamp();
  console.log('action:sent', JSON.stringify(e, null, 2));

  // Swap the "channel name" round if this is an incoming direct message.
  if(e.toUserOrChannel == e.myNick){
    e.toUserOrChannel = e.fromUser;
  }

  mainWindow.webContents.send('action:sent', e);
  saveToLog('action:sent', e);

}).on('irc:changedNick', function(e){
  e.timestamp = ISOTimestamp();
  console.log('user:nickChanged', JSON.stringify(e, null, 2));
  mainWindow.webContents.send('user:nickChanged', e);
  saveToLog('user:nickChanged', e);

}).on('irc:whois', function(e){
  e.timestamp = ISOTimestamp();
  console.log('server:whois', JSON.stringify(e, null, 2));
  mainWindow.webContents.send('server:whois', e);

}).on('irc:userStatus', function(e){
  console.log('user:userStatus', JSON.stringify(e, null, 2));
  mainWindow.webContents.send('user:userStatus', e);

});

var getSettings = function getSettings(cb){

  // Running in test mode, so use the test settings and return early
  if(DEBUG){
    var defaultSettingsObject = require('../templates/test-settings.json');
    return cb(defaultSettingsObject);
  }

  // Running normally, so check for existing user settings
  var settingsFile = path.join(app.getPath('appData'), pkgJson.name, 'settings.json');
  fse.readFile(settingsFile, 'utf8', function(err, settingsStream) {
    if(settingsStream){
      var settingsObject = JSON.parse(settingsStream.toString());
      cb(settingsObject);
    } else {
      // No user settings, so use the default settings
      // :TODO: Remove this once Backchat has a UI for editing settings
      var defaultSettingsObject = require('../templates/default-settings.json');
      cb(defaultSettingsObject);
    }
  });
}

var ISOTimestamp = function ISOTimestamp(){
  return new Date().toISOString();
}

var saveToLog = function saveToLog(type, e){
  var row = '[' + e.timestamp + '] ';

  if(type == 'channel:topicChanged'){
    row += 'Topic is: ' + e.topic;
    var channel = e.channel;
  } else if(type == 'channel:usersListed') {
    row += 'Users: ' + e.users.join(', ');
    var channel = e.channel;
  } else if(type == 'channel:joined'){
    row += e.user + ' joined the channel';
    var channel = e.channel;
  } else if(type == 'channel:parted'){
    row += e.user + ' left the channel';
    var channel = e.channel;
  } else if(type == 'message:sent'){
    row += '<' + e.fromUser + '> ' + e.messageText;
    var channel = e.toUserOrChannel;
  } else if(type == 'action:sent'){
    row += '• ' + e.fromUser + ' ' + e.actionText;
    var channel = e.toUserOrChannel;
  } else if(type == 'user:nickChanged'){
    row += e.oldNick + ' is now known as ' + e.newNick;
    var channel = e.channel;
  }

  row += "\n";

  var isoDate = new Date(e.timestamp).toISOString().substring(0,10);
  var logDir = path.join(loggingDirectory, e.server, channel);

  fse.ensureDir(logDir, function(){
    fse.appendFile(path.join(logDir, isoDate + '.txt'), row);
  });
}
