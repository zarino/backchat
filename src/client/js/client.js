var ipc = require('ipc');

// By default, EventEmitter will raise a warning when more than 10
// IPC listeners are attached at the same time. We tend to hit the
// limit when adding user:nickChanged listeners to a batch of users in
// a newly-joined channel. This ups the limit to 100.
ipc.setMaxListeners(100);

// Use django-style templating in underscore.js
// because my fat fingers can't learn angle brackets.
_.templateSettings = {
  evaluate: /\{\%(.+?)\%\}/g,
  interpolate: /\{\{(.+?)\}\}/g,
  escape: /\{-(.+?)-\}/g
}

var renderTemplate = function renderTemplate(templateName, data){
  data = data || {};
  var source = $('#' + templateName);
  if(source.length){
    return _.template( source.html() )(data);
  } else {
    throw 'renderTemplate Error: Could not find source template with matching #' + templateName;
  }
}

var timeFormat = function timeFormat(timestamp){
  var d = new Date(timestamp);
  return '[' + d.toLocaleTimeString(undefined, {hour12: false}) + ']';
}

var handleNotifications = function handleNotifications(event){
  var incrementChannelBadge = false;
  var importantChannelBadge = false;
  var notificationBalloon = false;
  var incrementDockBadge = false;
  var bounceDock = false;
  var beep = false;

  // Test event properties, in order of importance
  if(event.type == 'message' || event.type == 'action' || event.type == 'stageDirection'){
    if(window.isBlurred || event.channel != window.activeChannel){
      incrementChannelBadge = true;
    }

    if(window.isBlurred){
      incrementDockBadge = true;
    }

    if(includesKeyword(event.content) || event.channel.options.channelName == event.from){
      if(window.isBlurred || event.channel != window.activeChannel){
        importantChannelBadge = true;
        beep = true;
      }

      if(window.isBlurred) {
        notificationBalloon = true;
        bounceDock = true;
      }
    }

    if(includesKeyword(event.content)){
      beep = true;
    }
  }

  // Now actually do the notifications
  if(incrementChannelBadge){
    event.channel.getChannelButtonView().addNotification(importantChannelBadge);
  }
  if(beep){
    window.beep();
  }
  if(incrementDockBadge){
    ipc.send('client:incrementDockBadge');
  }
  if(bounceDock){
    ipc.send('client:bounceDock');
  }
  if(notificationBalloon){
    new Notification(event.channel.options.channelName, { body: event.content });
  }
}

var includesKeyword = function includesKeyword(text){
  var text = text.toLowerCase();
  var isImportant = false;
  _.each(window.app.keywords, function(keyword){
    if(text.indexOf(keyword.toLowerCase()) > -1){
      isImportant = true;
    }
  });
  return isImportant;
}


window.BackchatView = Backbone.View.extend({
  initialize: function(options) {
    var self = this;
    // Allow render() methods etc to access
    // all options specified at view creation.
    self.options = options;

    // We replicate the built-in Backbone Event listener,
    // but for IPC events. Note how we use .bind() to create
    // a *new* callback for each listener that has `this` set
    // to the View rather than the default EventEmitter object.
    if(typeof self.ipcEvents == 'object'){
      _.each(self.ipcEvents, function(callback, eventName){
        ipc.on(eventName, callback.bind(self));
      })
    }

    _.bindAll(self, 'render');
  }
});


window.AppView = window.BackchatView.extend({
  className: 'app',

  render: function(){
    this.$el.html( renderTemplate('app-view') );
    return this.$el;
  },

  ipcEvents: {
    'server:settings': function(settings){
      var self = this;
      _.each(settings.servers, function(server){
        self.addServerButton(server.url, { disconnected: true });
        _.each(server.channels, function(channelName){
          self.addChannelButton(server.url, channelName, { unjoined: true });
          self.addChannelView(server.url, channelName);
        });
      });
      // Add the user's specified keywords
      self.keywords = self.keywords.concat(settings.keywords);
    },
    'channel:joined': function(e){
      this.addServerButton(e.server);
      this.addChannelButton(e.server, e.channel);
      var v = this.addChannelView(e.server, e.channel);
      if(!window.activeChannel){
        v.focus();
      }
      v.addStageDirection({ userJoined: e.user, timestamp: e.timestamp });
      v.addUserButton(e.user);
      v.sortUserButtons();
      this.keywords.push(e.user);
    },
    'channel:parted': function(e){
      this.addServerButton(e.server);
      this.addChannelButton(e.server, e.channel);
      var v = this.addChannelView(e.server, e.channel)
      v.addStageDirection({ userParted: e.user, timestamp: e.timestamp });
      v.removeUserButton(e.user);
    },
    'channel:usersListed': function(e){
      this.addServerButton(e.server);
      this.addChannelButton(e.server, e.channel);
      this.addChannelView(e.server, e.channel)
        .listUsers(e.users);
    },
    'message:sent': function(e){
      this.addServerButton(e.server);
      this.addChannelButton(e.server, e.toUserOrChannel);
      this.addChannelView(e.server, e.toUserOrChannel)
        .addMessage(e.fromUser, e.messageText, e.timestamp);
    },
    'action:sent': function(e){
      this.addServerButton(e.server);
      this.addChannelButton(e.server, e.toUserOrChannel);
      this.addChannelView(e.server, e.toUserOrChannel)
        .addAction(e.fromUser, e.actionText, e.timestamp);
    },
    'channel:topicChanged': function(e){
      this.addServerButton(e.server);
      this.addChannelButton(e.server, e.channel);
      this.addChannelView(e.server, e.channel)
        .addStageDirection({ topic: e.topic, timestamp: e.timestamp });
    },
    'server:whois': function(e){
      window.activeChannel.addServerMessage(
        JSON.stringify(e.info, null, 2),
        e.timestamp
      );
    },
    'user:nickChanged': function(e){
      this.keywords = _.reject(this.keywords, function(keyword){
        return keyword === e.oldNick;
      });
      this.keywords.push(e.newNick);
    },
    'application:getActiveChannel': function(e){
      ipc.send(e.ipcCallback, {
        serverUrl: window.activeChannel.options.serverUrl,
        channelName: window.activeChannel.options.channelName,
        updatedTimestamp: window.activeChannel.updatedTimestamp
      });
    }
  },

  channelViews: {}, // Store channels views in here, keyed by serverUrl+channelName
  serverButtonViews: {}, // Keyed by serverUrl
  channelButtonViews: {}, // Keyed by serverUrl+channelName
  keywords: [], // Words that should trigger a notification

  addChannelView: function(serverUrl, channelName){
    var id = serverUrl + ' ' + channelName;

    if(id in this.channelViews){
      return this.channelViews[id];
    }

    var channelView = new window.ChannelView({
      serverUrl: serverUrl,
      channelName: channelName
    });
    channelView.render().appendTo(this.$('.app-content'));
    this.channelViews[id] = channelView;
    return channelView;
  },

  addServerButton: function(serverUrl, extraOptions){
    if(serverUrl in this.serverButtonViews){
      return this.serverButtonViews[serverUrl];
    }

    var options = _.extend({
      serverUrl: serverUrl
    }, extraOptions);

    var serverButtonView = new window.ServerButtonView(options);
    serverButtonView.render().appendTo(
      this.$('.channel-list')
    );
    this.serverButtonViews[serverUrl] = serverButtonView;
    return serverButtonView;
  },

  addChannelButton: function(serverUrl, channelName, extraOptions){
    var id = serverUrl + ' ' + channelName;

    if(id in this.channelButtonViews){
      return this.channelButtonViews[id];
    }

    var options = _.extend({
      serverUrl: serverUrl,
      channelName: channelName
    }, extraOptions);

    var channelButtonView = new window.ChannelButtonView(options);
    channelButtonView.render().appendTo(
      this.$('.channel-list')
    );
    this.channelButtonViews[id] = channelButtonView;
    return channelButtonView;
  }
});


window.ServerButtonView = window.BackchatView.extend({
  tagName: 'h1',

  render: function(){
    this.$el.text(this.options.serverUrl);
    if(this.options.disconnected){
      this.$el.addClass('disconnected');
    }
    return this.$el;
  },

  isRightServer: function(thing){
    if(thing.server == this.options.serverUrl){
      return true;
    } else {
      return false;
    }
  },

  ipcEvents: {
    'server:connected': function(e){
      if(this.isRightServer(e)){
        this.$el.removeClass('loading disconnected');
      }
    },
    'server:connecting': function(e){
      if(this.isRightServer(e)){
        this.$el.addClass('loading');
      }
    }
  }
});


window.ChannelButtonView = window.BackchatView.extend({
  tagName: 'button',

  render: function(){
    this.$el.text(this.options.channelName);
    this.$el.append('<div class="button-badges">');
    if(this.options.unjoined){
      this.$el.addClass('unjoined');
    }
    return this.$el;
  },

  events: {
    'click': function(){
      var id = this.options.serverUrl + ' ' + this.options.channelName;
      window.app.channelViews[id].focus();
    }
  },

  isRightChannel: function(thing){
    var thingChannel = thing.channel || thing.toUserOrChannel;
    if(
      thing.server == this.options.serverUrl &&
      thingChannel == this.options.channelName
    ){
      return true;
    } else {
      return false;
    }
  },

  isAboutMe: function(thing){
    var perpetrator = thing.user || thing.fromUser;
    if(thing.myNick == perpetrator){
      return true;
    } else {
      return false;
    }
  },

  ipcEvents: {
    'channel:joining': function(e){
      if(this.isRightChannel(e) && this.isAboutMe(e)){
        this.$el.addClass('loading');
      }
    },
    'channel:joined': function(e){
      if(this.isRightChannel(e) && this.isAboutMe(e)){
        this.$el.removeClass('loading unjoined');
      }
    },
    'channel:parted': function(e){
      if(this.isRightChannel(e) && this.isAboutMe(e)){
        this.$el.addClass('unjoined');
      }
    },
    'user:userStatus': function(details){
      if(details.server == this.options.serverUrl) {
        if(details.nick == this.options.channelName){
          if(details.away == true) {
            this.$el.addClass('away');
          } else if(details.away == false){
            this.$el.removeClass('away');
          }
        }
      }
    }
  },

  addNotification: function(isImportant){
    var $buttonBadges = this.$('.button-badges');
    if(isImportant){
      var $badge = $buttonBadges.children('.important');
      if($badge.length){
        var currentValue = parseInt($badge.text());
        $badge.text(currentValue + 1);
      } else {
        $badge = $('<span>').addClass('important');
        $badge.appendTo($buttonBadges);
        $badge.text(1);
      }
    } else {
      var $badge = $buttonBadges.children().not('.important');
      if($badge.length){
        var currentValue = parseInt($badge.text());
        $badge.text(currentValue + 1);
      } else {
        $badge = $('<span>');
        $badge.prependTo($buttonBadges);
        $badge.text(1);
      }
    }
  },

  clearNotifications: function(){
    this.$('.button-badges').empty();
  }
});


window.UserButtonView = window.BackchatView.extend({
  tagName: 'button',

  render: function(){
    this.$el.text(this.options.nick);
    return this.$el;
  },

  events: {
    'dblclick': function(){
      window.app.addServerButton(this.options.serverUrl);
      window.app.addChannelButton(this.options.serverUrl, this.options.nick);
      var v = window.app.addChannelView(this.options.serverUrl, this.options.nick);
      v.focus();
    }
  },

  ipcEvents: {
    'user:nickChanged': function(details){
      if(details.server == this.options.serverUrl) {
        if(details.oldNick == this.options.nick){
          this.options.nick = details.newNick;
          this.$el.text(details.newNick);
        }
      }
    },
    'user:userStatus': function(details){
      if(details.server == this.options.serverUrl) {
        if(details.nick == this.options.nick){
          if(details.away == true) {
            this.$el.addClass('away');
          } else if(details.away == false){
            this.$el.removeClass('away');
          }
        }
      }
    }
  }
});


window.ChannelView = window.BackchatView.extend({
  className: "channel",

  render: function(){
    this.$el.html(
      renderTemplate('channel')
    );
    return this.$el;
  },

  events: {
    'keypress .channel__input': function(e){
      var $input = $(e.currentTarget);
      if(e.keyCode == 13 && !e.altKey){
        ipc.send('client:sendMessage', {
          serverUrl: this.options.serverUrl,
          toUserOrChannel: this.options.channelName,
          messageText: $input.val()
        });
        $input.val(''); // clear the input
      }
    }
  },

  focus: function(){
    this.$el.addClass('active').siblings().removeClass('active');

    this.getChannelButtonView().$el.addClass('active').siblings().removeClass('active');
    this.getChannelButtonView().clearNotifications();

    this.$('.channel__input').focus();
    window.activeChannel = this;
  },

  userButtonViews: {}, // Store button views here, keyed by username
  updatedTimestamp: '', // Store time of latest message, for log retrieval

  getChannelButtonView: function(){
    var id = this.options.serverUrl + ' ' + this.options.channelName;
    return window.app.channelButtonViews[id];
  },

  listUsers: function(users){
    var self = this;
    _.each(users, function(user){
      self.addUserButton(user);
    });
    self.sortUserButtons();
  },

  addUserButton: function(nick){
    if(nick in this.userButtonViews){
      return // A button already exists for this user!
    }
    var userButtonView = new window.UserButtonView({
      serverUrl: this.options.serverUrl,
      channelName: this.options.channelName,
      nick: nick
    });
    userButtonView.render().appendTo(
      this.$('.channel__users')
    );
    this.userButtonViews[nick] = userButtonView;
  },

  removeUserButton: function(nick){
    if(nick in this.userButtonViews){
      this.userButtonViews[nick].remove();
      delete this.userButtonViews[nick];
    }
  },

  sortUserButtons: function(){
    var $userButtonList = this.$('.channel__users');
    var $userButtons = $userButtonList.children('button');
    $userButtons.sort(function(a, b){
      // a and b are DOM elements, inside the $userButtons jQuery wrapper
      return a.textContent.localeCompare(b.textContent, 'en', { sensitivity: 'base' });
    });
    $userButtons.detach().appendTo($userButtonList);
  },

  appendToScrollback: function($newElement){
    // If the user is within 50px of the bottom of the scrollback,
    // reposition the scrollback after the new element has been added,
    // so that they're still scrolled to the bottom.
    var outer = this.$('.channel__scrollback').height();
    var inner = this.$('.channel__scrollback__inner').outerHeight();
    var offset = this.$('.channel__scrollback').scrollTop();

    this.$('.channel__scrollback__inner').append($newElement);

    if(inner - outer - offset < 50){
      this.$('.channel__scrollback').scrollTop(inner);
    }
  },

  addMessage: function(fromUser, messageText, timestamp){
    var $newElement = $('<p>')
      .addClass('channel__message')
      .html(renderTemplate('message', {
        timestamp: timeFormat(timestamp),
        subject: fromUser + ' says —',
        message: messageText
      }));
    this.appendToScrollback($newElement);
    handleNotifications({
      type: 'message',
      channel: this,
      from: fromUser,
      content: messageText
    });
    this.updatedTimestamp = timestamp;
  },

  addAction: function(fromUser, actionText, timestamp){
    var $newElement = $('<p>')
      .addClass('channel__action')
      .html(renderTemplate('message', {
        timestamp: timeFormat(timestamp),
        subject: fromUser,
        message: actionText
      }));
    this.appendToScrollback($newElement);
    handleNotifications({
      type: 'action',
      channel: this,
      from: fromUser,
      content: actionText
    });
    this.updatedTimestamp = timestamp;
  },

  addStageDirection: function(options){
    if('topic' in options){
      var subject = 'Topic is:';
      var messageText = options.topic;
    } else if('userJoined' in options){
      var subject = options.userJoined;
      var messageText = 'joined the channel';
    } else if('userParted' in options){
      var subject = options.userParted;
      var messageText = 'left the channel';
    }
    var $newElement = $('<p>')
      .addClass('channel__stage-direction')
      .html(renderTemplate('message', {
        timestamp: timeFormat(options.timestamp),
        subject: subject,
        message: messageText
      }));
    this.appendToScrollback($newElement);
    handleNotifications({
      type: 'stageDirection',
      channel: this,
      from: undefined,
      content: messageText
    });
    this.updatedTimestamp = options.timestamp;
  },

  addServerMessage: function(messageText, timestamp){
    var $newElement = $('<div>')
      .addClass('channel__server-message')
      .html('<pre>' + messageText + '</pre>');
    this.appendToScrollback($newElement);
    handleNotifications({
      type: 'serverMessage',
      channel: this,
      from: undefined,
      content: messageText
    });
    this.updatedTimestamp = timestamp;
  }
});

window.isBlurred = false;

ipc.on('window:blurred', function(){
  window.isBlurred = true;
}).on('window:focussed', function(){
  window.isBlurred = false;
  if('activeChannel' in window){
    window.activeChannel.getChannelButtonView().clearNotifications();
  }
  ipc.send('client:clearDockBadge');
});

window.beep = function beep(){
  var audio = new Audio('mp3/ping.mp3');
  audio.play();
}

$(function(){

  // Kick things off, create the app!
  window.app = new window.AppView();
  app.render().prependTo('body');

  // Tell the server to connect.
  ipc.send('client:ready');

});