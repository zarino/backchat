var app = require('app');
var Menu = require('menu');

var _ = require('underscore-plus');
var EventEmitter = require('events').EventEmitter;

var ApplicationMenu;

module.exports = ApplicationMenu = (function(){
  // Give this Class extra methods like ".on()"
  _.extend(ApplicationMenu.prototype, EventEmitter.prototype);

  // Class constructor
  function ApplicationMenu(options){
    var menuJson = require(options.templateJson);
    this.template = this.translateTemplate(menuJson, options.pkgJson);
    this.menu = Menu.buildFromTemplate(_.deepClone(this.template));
  };

  ApplicationMenu.prototype.wireUpMenuItem = function(menu, command){
    var _this = this;
    menu.click = function(){
      _this.emit(command);
    };
  };

  ApplicationMenu.prototype.translateTemplate = function(template, pkgJson){
    var emitter = this.emit;
    var _this = this;

    _.each(template, function(item){
      item.metadata = item.metadata || {};

      if(item.label){
        item.label = (_.template(item.label))(pkgJson);
      }

      if(item.command){
        _this.wireUpMenuItem(item, item.command);
      }

      if(item.submenu){
        _this.translateTemplate(item.submenu, pkgJson);
      }
    });

    return template;
  };

  // Find menu items with the given key:value attributes
  ApplicationMenu.prototype.find = function(attributes){
    return _.where(this.menu.items, attributes);
  };

  // Find menu items by attribute, and then set other attributes on them.
  // eg: menu.set({ id: "exampleItem" }, { enabled: false });
  ApplicationMenu.prototype.set = function(findByAtrributes, setAttributes){
    _.each(this.find(findByAtrributes), function(menuItem){
      _.each(setAttributes, function(value, key){
        menuItem[key] = value;
      });
    });
    return this; // Enable chaining
  }

  return ApplicationMenu;
})();