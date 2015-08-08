var irc = require('irc');
var _ = require('underscore-plus');
var EventEmitter = require('events').EventEmitter;

var ConnectionPool;

module.exports = ConnectionPool = (function(){
  // Give this Class extra methods like ".on()"
  _.extend(ConnectionPool.prototype, EventEmitter.prototype);

  // Class constructor
  function ConnectionPool(){
    this.connections = {}; // keyed by server url
  };

  ConnectionPool.prototype.addConnection = function(connectionSettings){
    var self = this;

    if(connectionSettings.autoConnect){
      self.emit('irc:registering', {
        server: connectionSettings.url
      });
    }

    var client = new irc.Client(
      connectionSettings.url,
      connectionSettings.nick,
      {
        port: connectionSettings.port,
        userName: connectionSettings.userName,
        realName: connectionSettings.realName,
        autoConnect: connectionSettings.autoConnect
      }
    );

    client.addListener('registered', function(message){
      // console.log('[irc event]', '[registered]', message);
      self.emit('irc:registered', {
        server: connectionSettings.url,
        message: message
      });

      // Register with NickServ if a password is available.
      if("nickPassword" in connectionSettings){
        client.say('NickServ', 'identify ' + connectionSettings.nickPassword);
      }

      // Join channels from config file if requested
      if(connectionSettings.autoConnect && connectionSettings.channels){
        _.each(connectionSettings.channels, function(channelName){
          client.join(channelName);
          self.emit('irc:joining', {
            server: connectionSettings.url,
            channel: channelName
          });
        });
      }

      // Start the function that checks for user away statuses
      refreshUserStatuses();

    }).addListener('names', function(channel, nicks){
      // console.log('[irc event]', '[names]', channel, nicks);
      self.emit('irc:names', {
        server: connectionSettings.url,
        channel: channel,
        users: Object.keys(nicks).sort(function(a, b){
          return a.localeCompare(b, 'en', { sensitivity: 'base' });
        })
      });

    }).addListener('topic', function(channel, topic, nick, message){
      // console.log('[irc event]', '[topic]', channel, topic, nick);
      self.emit('irc:topic', {
        server: connectionSettings.url,
        channel: channel,
        topic: topic,
        user: nick
      });

    }).addListener('join', function(channel, nick, message){
      // console.log('[irc event]', '[join]', channel, nick);
      self.emit('irc:join', {
        server: connectionSettings.url,
        channel: channel,
        user: nick,
        myNick: client.nick
      });
      client.send('WHO', channel);

    }).addListener('part', function(channel, nick, reason, message){
      // console.log('[irc event]', '[part]', channel, nick, reason);
      self.emit('irc:part', {
        server: connectionSettings.url,
        channel: channel,
        user: nick,
        reason: reason,
        myNick: client.nick
      });

    }).addListener('quit', function(nick, reason, channels, message){
      // console.log('[irc event]', '[quit]', nick, reason, channels);
      self.emit('irc:quit', {
        server: connectionSettings.url,
        user: nick,
        reason: reason,
        channels: channels,
        myNick: client.nick
      });

    }).addListener('kick', function(channel, nick, by, reason, message){
      console.log('[irc event]', '[kick]', channel, nick, by, reason);
      self.emit('irc:kick', {
        server: connectionSettings.url,
        channel: channel,
        user: nick,
        by: by,
        reason: reason,
        myNick: client.nick
      });

    }).addListener('kill', function(nick, reason, channels, message){
      console.log('[irc event]', '[kill]', nick, reason, channels);
      self.emit('irc:kill', {
        server: connectionSettings.url,
        user: nick,
        reason: reason,
        channels: channels,
        myNick: client.nick
      });

    }).addListener('message', function(nick, to, text, message){
      // console.log('[irc event]', '[message]', nick, to, text);
      self.emit('irc:message', {
        server: connectionSettings.url,
        fromUser: nick,
        toUserOrChannel: to,
        messageText: text,
        myNick: client.nick
      });

    }).addListener('selfMessage', function(to, text){
      // console.log('[irc event]', '[selfMessage]', to, text);

      // Ignore messages sent to NickServ.
      if(to == "NickServ"){
        return true;
      }

      self.emit('irc:message', {
        server: connectionSettings.url,
        fromUser: client.nick,
        toUserOrChannel: to,
        messageText: text,
        myNick: client.nick
      });

    }).addListener('notice', function(nick, to, text, message){
      console.log('[irc event]', '[notice]', nick, to, text);
      self.emit('irc:notice', {
        server: connectionSettings.url,
        user: nick,
        to: to, // user or channel?
        messageText: text,
        myNick: client.nick
      });

    }).addListener('nick', function(oldnick, newnick, channels, message){
      // console.log('[irc event]', '[nick]', oldnick, newnick, channels);
      self.emit('irc:changedNick', {
        server: connectionSettings.url,
        oldNick: oldnick,
        newNick: newnick,
        channels: channels,
        myNick: client.nick
      });

    }).addListener('action', function(from, to, text, message){
      // console.log('[irc event]', '[action]', from, to, text);
      self.emit('irc:action', {
        server: connectionSettings.url,
        fromUser: from,
        toUserOrChannel: to,
        actionText: text,
        myNick: client.nick
      });

    }).addListener('whois', function(info){
      // console.log('[irc event]', '[whois]', info);
      self.emit('irc:whois', {
        server: connectionSettings.url,
        info: info
      });
      self.emit('irc:userStatus', {
        server: connectionSettings.url,
        nick: info.nick,
        away: ('away' in info)
      });

    }).addListener('channellist_start', function(){
      // console.log('[irc event]', '[channellist_start]');

    }).addListener('channellist_item', function(){
      // console.log('[irc event]', '[channellist_item]');

    }).addListener('channellist', function(){
      // console.log('[irc event]', '[channellist]');

    }).addListener('raw', function(message){
      // console.log('[irc event]', '[raw]', message);

      if(message.command == 'rpl_whoreply'){
        self.emit('irc:userStatus', {
          server: connectionSettings.url,
          nick: message.args[5],
          away: message.args[6].startsWith('G')
        });
      } else if(message.command == 'rpl_nowaway'){
        self.emit('irc:userStatus', {
          server: connectionSettings.url,
          nick: message.args[0],
          away: true
        });
      } else if(message.command == 'rpl_unaway'){
        self.emit('irc:userStatus', {
          server: connectionSettings.url,
          nick: message.args[0],
          away: false
        });
      }
    });

    var refreshUserStatuses = function refreshUserStatuses(options){
      options = _.extend({}, options);

      // client.chans should be an object of channels the
      // user is currently occupying, keyed by channelName.
      _.each(client.chans, function(channelInfo, channelName){
        client.send('WHO', channelName);
      });

      if(!options.oneOff){
        setTimeout(refreshUserStatuses, 10000);
      }
    }

    self.connections[connectionSettings.url] = client;
  };

  ConnectionPool.prototype.getConnection = function(serverUrl){
    if(serverUrl in this.connections){
      return this.connections[serverUrl];
    } else {
      throw new Error('That server is not currently connected.');
    }
  }

  return ConnectionPool;

})();