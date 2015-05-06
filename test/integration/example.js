var assert = require('assert');
var helper = require('../integration-helper.js');

describe('Testing the browser window', function(){

  before(function(){
    helper.startServer();
    this.browser = helper.createBrowser();
    // Return a promise that only completes
    // once the window has been created.
    return this.browser.getWindowHandle();
  });

  it('contains “Backchat”', function(done){
    this.browser.getTitle().then(function(title) {
      assert.equal('Backchat', title);
      done();
    }, function(arg){
      done(arg);
    });
  });

  it('contains .app-sidebar and .app-content elements', function(done){
    this.browser.findElement({css: '.app-sidebar + .app-content'}).then(function(){
      done()
    })
  });

  after(function(){
    this.browser.quit();
  });

});
