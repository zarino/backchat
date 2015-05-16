var ipc = require('ipc');

// By default, EventEmitter will raise a warning when more than 10
// IPC listeners are attached at the same time. We tend to hit the
// limit when adding nick:changed listeners to a batch of users in
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
    },
    'channel:joined': function(e){
      this.addServerButton(e.server);
      this.addChannelButton(e.server, e.channel);
      var v = this.addChannelView(e.server, e.channel);
      v.addStageDirection({ userJoined: e.user });
      v.addUserButton(e.user);
    },
    'channel:parted': function(e){
      this.addServerButton(e.server);
      this.addChannelButton(e.server, e.channel);
      var v = this.addChannelView(e.server, e.channel)
      v.addStageDirection({ userParted: e.user });
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
        .addMessage(e.fromUser, e.messageText);
    },
    'action:sent': function(e){
      this.addServerButton(e.server);
      this.addChannelButton(e.server, e.toUserOrChannel);
      this.addChannelView(e.server, e.toUserOrChannel)
        .addAction(e.fromUser, e.actionText);
    },
    'channel:topicChanged': function(e){
      this.addServerButton(e.server);
      this.addChannelButton(e.server, e.channel);
      this.addChannelView(e.server, e.channel)
        .addStageDirection({ topic: e.topic });
    },
    'server:whois': function(e){
      window.activeChannel.addServerMessage(JSON.stringify(e.info, null, 2));
    }
  },

  channelViews: {}, // Store channels views in here, keyed by serverUrl+channelName
  serverButtonViews: {}, // Keyed by serverUrl
  channelButtonViews: {}, // Keyed by serverUrl+channelName

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
    if(this.options.unjoined){
      this.$el.addClass('unjoined');
    }
    return this.$el;
  },

  events: {
    'click': function(){
      var id = this.options.serverUrl + ' ' + this.options.channelName;
      window.app.channelViews[id].focus();
      this.$el.addClass('active').siblings().removeClass('active');
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
    'channel:joined': function(e){
      if(this.isRightChannel(e) && this.isAboutMe(e)){
        this.$el.removeClass('unjoined');
      }
    },
    'channel:parted': function(e){
      if(this.isRightChannel(e) && this.isAboutMe(e)){
        this.$el.addClass('unjoined');
      }
    }
  }
});


window.UserButtonView = window.BackchatView.extend({
  tagName: 'button',

  render: function(){
    this.$el.text(this.options.nick);
    return this.$el;
  },

  ipcEvents: {
    'nick:changed': function(details){
      this.$el.text(details.newNick);
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
    this.$('.channel__input').focus();
    window.activeChannel = this;
  },

  userButtonViews: {}, // Store button views here, keyed by username

  listUsers: function(users){
    var self = this;
    _.each(users, function(user){
      self.addUserButton(user);
    });
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

  addMessage: function(fromUser, messageText){
    $('<p>')
      .addClass('channel__message')
      .html('<b>' + fromUser + ' says —</b> ' + messageText)
      .appendTo(this.$('.channel__scrollback__inner'));
  },

  addAction: function(fromUser, actionText){
    $('<p>')
      .addClass('channel__action')
      .html('<b>' + fromUser + '</b> ' + actionText)
      .appendTo(this.$('.channel__scrollback__inner'));
  },

  addStageDirection: function(options){
    if('topic' in options){
      var html = '<b>Topic is:</b> ' + options.topic;
    } else if('userJoined' in options){
      var html = '<b>' + options.userJoined + '</b> joined the channel';
    } else if('userParted' in options){
      var html = '<b>' + options.userParted + '</b> left the channel';
    }
    $('<p>')
      .addClass('channel__stage-direction')
      .html(html)
      .appendTo(this.$('.channel__scrollback__inner'));
  },

  addServerMessage: function(messageText){
    $('<div>')
      .addClass('channel__server-message')
      .html('<pre>' + messageText + '</pre>')
      .appendTo(this.$('.channel__scrollback__inner'));
  }
});

window.isBlurred = false;

ipc.on('window:blurred', function(){
  window.isBlurred = true;
}).on('window:focussed', function(){
  window.isBlurred = false;
});


$(function(){

  // Kick things off, create the app!
  window.app = new window.AppView();
  app.render().prependTo('body');

  // Tell the server to connect.
  ipc.send('client:ready');

});