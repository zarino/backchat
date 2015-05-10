// Wadsworth (named after the butler from Clue,
// rather than the British dazzle ship painter.)
//
// Helps fetch things by waiting for them to appear.

module.exports = {

  getVisible: function(css, callback){
    var browser = this.browser;
    var endTime = Date.now() + 4000;
    var poll = function(){
      browser.findElement({css: css}).then(function(element){
        element.isDisplayed().then(function(isDisplayed){
          if(isDisplayed){
            callback(element);
          } else {
            setTimeout(poll, 200);
          }
        });
      }, function(){
        if(Date.now() > endTime){
          throw new Error("Element did not appear");
        } else {
          setTimeout(poll, 200);
        }
      });
    }
    poll();
  },

  getElement: function(css, callback){
    var browser = this.browser;
    var endTime = Date.now() + 4000;
    var poll = function(){
      browser.findElement({css: css}).then(function(element){
        callback(element);
      }, function(){
        if(Date.now() > endTime){
          throw new Error("Element did not appear");
        } else {
          setTimeout(poll, 200);
        }
      });
    }
    poll();
  },

  getElements: function(css, callback){
    var browser = this.browser;
    var endTime = Date.now() + 4000;
    var poll = function(){
      browser.findElements({css: css}).then(function(elements){
        if(elements.length > 0){
          callback(elements);
        } else {
          setTimeout(poll, 200);
        }
      }, function(){
        if(Date.now() > endTime){
          throw new Error("Element did not appear");
        } else {
          setTimeout(poll, 200);
        }
      });
    }
    poll();
  },

  hasClass: function(element, className, callback){
    element.getAttribute('class').then(function(classes){
      var hasClass = classes.split(' ').indexOf(className) > -1;
      callback(hasClass);
    });
  }

}
