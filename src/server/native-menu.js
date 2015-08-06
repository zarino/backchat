var app = require('app');
var Menu = require('menu');

var _ = require('underscore-plus');
var EventEmitter = require('events').EventEmitter;

var NativeMenu;

module.exports = NativeMenu = (function(){
  // Give this Class extra methods like ".on()"
  _.extend(NativeMenu.prototype, EventEmitter.prototype);

  // Class constructor
  function NativeMenu(){};

  // Takes a JSON object representing the menu structure, and an
  // optional dictionary of variables to render the template with.
  // Replaces the menu’s existing contents with the new stuff.
  // Returns the menu instance, for chaining.
  NativeMenu.prototype.construct = function(templateJson, contextVariables){
    this.context = contextVariables || {};
    this.template = this.translateTemplate(templateJson, this.context);
    this.menu = Menu.buildFromTemplate(this.template);
    return this;
  };

  NativeMenu.prototype.translateTemplate = function(templateJson, context){
    var self = this;

    _.each(templateJson, function(item){
      item.metadata = item.metadata || {};

      if(item.label){
        item.label = _.template(item.label)(context);
      }

      if(item.command){
        item.click = function(){
          self.emit(item.command, item);
        }
      }

      if(item.submenu){
        self.translateTemplate(item.submenu, context);
      }
    });

    return templateJson;
  };

  // Shortcut for Menu.setApplicationMenu(thing.menu)
  // which also returns the menu instance for chaining.
  NativeMenu.prototype.setApplicationMenu = function(){
    Menu.setApplicationMenu(this.menu);
    return this;
  };

  // Find menu items with the given key:value attributes
  NativeMenu.prototype.find = function(attributes){
    return _.where(this.menu.items, attributes);
  };

  // Find menu items by attribute, and then set other attributes on them.
  // eg: menu.set({ id: "exampleItem" }, { enabled: false });
  NativeMenu.prototype.set = function(findByAtrributes, setAttributes){
    _.each(this.find(findByAtrributes), function(menuItem){
      _.each(setAttributes, function(value, key){
        menuItem[key] = value;
      });
    });
    return this; // Enable chaining
  }

  return NativeMenu;
})();
