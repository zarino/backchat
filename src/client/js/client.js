var ipc = require('ipc');
var webframe = require('web-frame');

var spellchecker = require('spellchecker');
var Autolinker = require('autolinker');

// By default, EventEmitter will raise a warning when more than 10
// IPC listeners are attached at the same time. We tend to hit the
// limit when adding user:nickChanged listeners to a batch of users in
// a newly-joined channel. This ups the limit to 100.
ipc.setMaxListeners(100);

// Enable spellchecking for message composition boxes.
webframe.setSpellCheckProvider("en-GB", true, {
  spellCheck: function(text) {
    return ! spellchecker.isMisspelled(text);
  }
});

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
  if(event.type == 'message' || event.type == 'action'){
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

var escapeHtml = function escapeHtml(text){
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

var wrapKeywords = function wrapKeywords(text, htmlTag){
  _.each(window.app.keywords, function(keyword){
    var pattern = new RegExp(keyword, 'ig');
    text = text.replace(pattern, '<' + htmlTag +'>$&</' + htmlTag + '>');
  })
  return text;
}

var linkifyUrls = function linkifyUrls(text){
  var afterText = '';
  var text = Autolinker.link(text, {
    stripPrefix: false,
    hashtag: false,
    replaceFn: function(autolinker, match){
      if(match.getType() == 'url'){
        var link = document.createElement('a');
        link.href = match.getUrl();
        if(link.pathname.match(/[.](gif|png|jpg|jpeg)/i)){
          afterText += '<a href="' + link.href + '" target="_blank"><img src="' + link.href + '"></a>';
        }
        return true; // Default autolinker behaviour
      } else {
        return true; // Default autolinker behaviour
      }
    }
  });

  return text + afterText;
}

// Prepare a string for display in the channel scrollback
var messageFormat = function messageFormat(text){
  text = escapeHtml(text);
  text = wrapKeywords(text, 'strong');
  text = linkifyUrls(text);
  return text;
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
        _.each(server.channels, function(channel){
          self.addChannelButton(server.url, channel.name, { unjoined: true });
          self.addChannelView(server.url, channel.name, { unjoined: true });
        });
      });
      // Add the user's specified keywords
      self.keywords = self.keywords.concat(settings.keywords);
    },
    'server:connected': function(e){
      // The server replies with our nick. Add it to keywords.
      this.keywords.push(e.message.args[0]);
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
    },
    'channel:parted': function(e){
      this.addServerButton(e.server);
      this.addChannelButton(e.server, e.channel);
      var v = this.addChannelView(e.server, e.channel);
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
        e.timestamp,
        '/whois ' + e.info.nick
      );
    },
    'user:nickChanged': function(e){
      this.keywords = _.reject(this.keywords, function(keyword){
        return keyword === e.oldNick;
      });
      this.keywords.push(e.newNick);
    },
    'application:replaceSelectedWordWithSuggestion': function(e){
      var $input = $('textarea:focus, input:focus');
      var textBeforeSelection = $input.val().substring(0, $input[0].selectionStart);
      var textAfterSelection = $input.val().substring($input[0].selectionEnd);
      var newCaretPosition = textBeforeSelection.length + e.replacementText.length;
      $input.val(textBeforeSelection + e.replacementText + textAfterSelection);
      $input[0].setSelectionRange(newCaretPosition, newCaretPosition);
    }
  },

  channelViews: {}, // Store channels views in here, keyed by serverUrl+channelName
  serverButtonViews: {}, // Keyed by serverUrl
  channelButtonViews: {}, // Keyed by serverUrl+channelName
  keywords: [], // Words that should trigger a notification

  addChannelView: function(serverUrl, channelName, extraOptions){
    var id = serverUrl + ' ' + channelName;

    if(id in this.channelViews){
      return this.channelViews[id];
    }

    var options = _.extend({
      serverUrl: serverUrl,
      channelName: channelName
    }, extraOptions);

    var channelView = new window.ChannelView(options);
    channelView.render().appendTo(
      this.$('.app-content')
    );
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
    return (thing.server == this.options.serverUrl);
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
    var id = this.options.serverUrl + ' ' + this.options.channelName;
    this.$el.text(this.options.channelName);
    this.$el.attr('data-id', id);
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
    },
    'contextmenu': function(){
      ipc.send('client:showChannelButtonContextMenu', {
        serverUrl: this.options.serverUrl,
        channelName: this.options.channelName,
        joined: ! this.$el.is('.unjoined')
      });
    }
  },

  isRightChannel: function(thing){
    var thingChannel = thing.channel || thing.toUserOrChannel || thing.channelName;
    var thingServer = thing.server || thing.serverUrl;
    return (
      thingServer == this.options.serverUrl &&
      thingChannel == this.options.channelName
    );
  },

  isAboutMe: function(thing){
    var perpetrator = thing.user || thing.fromUser;
    return (thing.myNick == perpetrator);
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

    if(this.options.unjoined == true){
      this.leave();
    }

    return this.$el;
  },

  events: {
    'keydown .channel__input': function(e){
      var $input = $(e.currentTarget);

      if(e.keyCode == 13 && !e.altKey){
        // enter without alt
        e.preventDefault();

        ipc.send('client:sendMessage', {
          serverUrl: this.options.serverUrl,
          toUserOrChannel: this.options.channelName,
          messageText: $input.val()
        });
        this.sentMessages.push($input.val()); // store message in channel history
        $input.val(''); // clear the input

      } else if(e.keyCode == 9 && !e.altKey && !e.shiftKey) {
        // tab without alt or shift
        e.preventDefault();

        var cursorPosition = $input[0].selectionStart;
        var allText = $input.val();
        var textBeforeCursor = allText.substring(0, cursorPosition);
        var textAfterCursor = allText.substring(cursorPosition);
        var wordsBeforeCursor = textBeforeCursor.split(' ');
        var currentWord = _.last(wordsBeforeCursor);
        var textBeforeCurrentWord = textBeforeCursor.slice(0, currentWord.length * -1);

        var matchingNicks = _.filter(_.keys(this.userButtonViews), function(nick){
          return nick.toLowerCase().startsWith(currentWord.toLowerCase());
        });

        if(matchingNicks.length == 1){
          var newCursorPosition = textBeforeCurrentWord.length + matchingNicks[0].length;
          $input.val(textBeforeCurrentWord + matchingNicks[0] + textAfterCursor);
          $input[0].setSelectionRange(newCursorPosition, newCursorPosition);
        } else {
          window.funk();
        }

      } else if(e.keyCode == 38 && e.altKey){
        // alt-up-arrow
        e.preventDefault();

        var text = $input.val();
        var index = _.lastIndexOf(this.sentMessages, text);

        if(index == -1){
          // Current input value is not in sent messages, so it must be new.
          if($.trim(text) != ''){
            // Append the current text content to the sent message list,
            // and then pull out the one that came before it.
            this.sentMessages.push(text);
            $input.val(this.sentMessages.slice(-2,-1)[0]);
          } else {
            // No current text to save, so just pull out the last message.
            $input.val(_.last(this.sentMessages));
          }
        } else if(index > 0) {
          // Current input value is in sent messages,
          // and there is at least one older message.
          $input.val(this.sentMessages[index - 1])
        }

      } else if(e.keyCode == 40 && e.altKey){
        // alt-down-arrow
        e.preventDefault();
        var text = $input.val();

        var index = _.lastIndexOf(this.sentMessages, text);

        if(index > -1 && index < this.sentMessages.length - 1){
          // Current input value is in sent messages,
          // and there is at least one newer message.
          $input.val(this.sentMessages[index + 1])
        } else if(index == this.sentMessages.length - 1){
          // We're at the most recent item in the list,
          // so the next item will just be a blank string.
          $input.val('');
        }
      }
    },
    'contextmenu .channel__input': function(){
      var spellingSuggestions;
      var selectedText = window.getSelection().toString();
      var numberOfWords = selectedText.split(' ').length;
      if(numberOfWords == 1){
        if(spellchecker.isMisspelled(selectedText)){
          spellingSuggestions = spellchecker.getCorrectionsForMisspelling(selectedText);
        }
      }
      ipc.send('client:showGenericTextContextMenu', {
        spellingSuggestions: spellingSuggestions,
        isEditable: true,
        isRange: selectedText.length > 0
      });
    },
    'contextmenu .channel__scrollback': function(){
      var selectedText = window.getSelection().toString();
      ipc.send('client:showGenericTextContextMenu', {
        isEditable: false,
        isRange: selectedText.length > 0
      });
    }
  },

  ipcEvents: {
    'channel:parted': function(e){
      if(this.isRightChannel(e) && this.isAboutMe(e)){
        this.leave();
      }
    },
    'channel:joined': function(e){
      if(this.isRightChannel(e) && this.isAboutMe(e)){
        this.join();
      }
    },
    'channel:close': function(e){
      if(this.isRightChannel(e)){
        this.close();
      }
    }
  },

  isRightChannel: function(thing){
    var thingChannel = thing.channel || thing.toUserOrChannel || thing.channelName;
    var thingServer = thing.server || thing.serverUrl;
    return (
      thingServer == this.options.serverUrl &&
      thingChannel == this.options.channelName
    );
  },

  isAboutMe: function(thing){
    var perpetrator = thing.user || thing.fromUser;
    return (thing.myNick == perpetrator);
  },

  unfocus: function(){
    this.$el.removeClass('active');
    this.getChannelButtonView().$el.removeClass('active');

    this.$('.channel__scrollback__inner .bookmark').remove();
    this.appendToScrollback('<hr class="bookmark">');
  },

  focus: function(){
    if('activeChannel' in window){
      window.activeChannel.unfocus();
    }

    this.$el.addClass('active');
    this.getChannelButtonView().$el.addClass('active');

    this.getChannelButtonView().clearNotifications();

    this.$('.channel__input').focus();

    ipc.send('client:activeChannelChanged', {
      serverUrl: this.options.serverUrl,
      channelName: this.options.channelName,
      isJoined: ! this.$el.is('.unjoined')
    });

    window.activeChannel = this;
  },

  join: function(){
    this.$el.removeClass('unjoined');
    this.$('.channel__input').prop('disabled', false);
  },

  leave: function(){
    this.removeUserButtons();
    this.$el.addClass('unjoined');
    this.$('.channel__input').prop('disabled', true);
  },

  close: function(){
    var id = this.options.serverUrl + ' ' + this.options.channelName;

    // Switch to the nearest channel in the sidebar (if one exists).
    // That might be the one above or below. Or neither!
    var $nearestChannelButtonView = this.getChannelButtonView().$el.prev('button');
    if($nearestChannelButtonView.length == 0){
      $nearestChannelButtonView = this.getChannelButtonView().$el.next('button');
    }
    if($nearestChannelButtonView.length != 0){
      window.app.channelViews[ $nearestChannelButtonView.attr('data-id') ].focus();
    }

    // Remove this channel's channelButton.
    this.getChannelButtonView().remove();
    delete window.app.channelButtonViews[id];

    // Remove all userButtons.
    this.removeUserButtons();

    // Remove this channelView.
    this.remove();
    delete window.app.channelViews[id];
  },

  userButtonViews: {}, // Store button views here, keyed by username
  updatedTimestamp: '', // Store time of latest message, for log retrieval
  sentMessages: [],

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

  removeUserButtons: function(){
    var self = this;
    _.each(self.userButtonViews, function(userButtonView, nick){
      self.removeUserButton(nick);
    });
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
        subject: escapeHtml(fromUser) + ' says —',
        message: messageFormat(messageText, 'strong')
      }));
    if(includesKeyword(messageText)){
      $newElement.addClass('highlighted');
    }
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
      .addClass('channel__message')
      .html(renderTemplate('message', {
        timestamp: timeFormat(timestamp, 'strong'),
        subject: escapeHtml(fromUser),
        message: messageFormat(actionText)
      }));
    if(includesKeyword(actionText)){
      $newElement.addClass('highlighted');
    }
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
        subject: escapeHtml(subject),
        message: escapeHtml(messageText)
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

  addServerMessage: function(messageText, timestamp, command){
    var $newElement = $('<div>')
      .addClass('channel__server-message')
      .html(renderTemplate('message', {
        timestamp: timeFormat(timestamp),
        subject: escapeHtml(command),
        message: '<span class="code">' + escapeHtml(messageText) + '</span>'
      }));
    this.appendToScrollback($newElement);
    handleNotifications({
      type: 'serverMessage',
      channel: this,
      from: undefined,
      content: escapeHtml(messageText)
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

window.funk = function funk(){
  var audio = new Audio('mp3/funk.mp3');
  audio.play();
}

$(function(){

  // Kick things off, create the app!
  window.app = new window.AppView();
  app.render().prependTo('body');

  // Tell the server to connect.
  ipc.send('client:ready');

});