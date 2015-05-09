var assert = require('assert');
var helper = require('../integration-helper.js');

describe('Testing the browser window', function(){

  before(function(){
    this.server = helper.startServer();
    this.browser = helper.createBrowser();
    // Return a promise that only completes
    // once the window has been created.
    return this.browser.getWindowHandle();
  });

  it('Window title is “Backchat”', function(done){
    this.browser.getTitle().then(function(title) {
      assert.equal('Backchat', title);
      done();
    }, function(arg){
      done(arg);
    });
  });

  it('Window has a sidebar and content', function(done){
    this.browser.isElementPresent({css: '.app-sidebar + .app-content'}).then(function(){
      done()
    })
  });

  it('Sidebar contains connected server name', function(done){
    this.browser.findElements({css: '.app-sidebar .channel-list h1'}).then(function(elements){
      assert.equal(elements.length, 1);
      elements[0].getText().then(function(text){
        assert.equal(text, 'localhost');
        done();
      });
    });
  });

  it('Sidebar contains connected channel name', function(done){
    this.browser.findElements({css: '.channel-list button'}).then(function(elements){
      assert.equal(elements.length, 1);
      elements[0].getText().then(function(text){
        assert.equal(text, '#channel1');
        done();
      });
    });
  });

  after(function(){
    this.browser.quit();
  });

});
