var app = require('app');
var Menu = require('menu');

var _ = require('underscore-plus');
var EventEmitter = require('events').EventEmitter;

var menuJson = require('../templates/mac-menu.json');
var ApplicationMenu;

module.exports = ApplicationMenu = (function(){
  // Give this Class extra methods like ".on()"
  _.extend(ApplicationMenu.prototype, EventEmitter.prototype);

  // Class constructor
  function ApplicationMenu(options){
    this.template = this.translateTemplate(menuJson, options.pkgJson);
  };

  ApplicationMenu.prototype.attachToWindow = function(window){
    this.menu = Menu.buildFromTemplate(_.deepClone(this.template));
    Menu.setApplicationMenu(this.menu);
  };

  ApplicationMenu.prototype.wireUpMenu = function(menu, command){
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
        _this.wireUpMenu(item, item.command);
      }

      if(item.submenu){
        _this.translateTemplate(item.submenu, pkgJson);
      }
    });

    return template;
  };

  return ApplicationMenu;
})();