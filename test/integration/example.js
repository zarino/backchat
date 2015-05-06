var webdriver = require('selenium-webdriver');
var assert = require('assert');

var createBrowser = function createBrowser(){
  return new webdriver.Builder()
    .usingServer('http://localhost:9515')
    .withCapabilities({
      chromeOptions: {
        binary: 'Backchat.app/Contents/MacOS/Electron'
      }
    })
    .forBrowser('electron')
    .build();
}

describe('Testing the browser window', function(){

  before(function(){
    this.browser = createBrowser();
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
