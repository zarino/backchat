var assert = require("assert");
var webdriver = require("selenium-webdriver");
  
var driver = new webdriver.Builder()
  .usingServer('http://127.0.0.1:4444/wd/hub')
  .withCapabilities({
    chromeOptions: {
      binary: '/Applications/Electron.app/Contents/MacOS/Electron'
    }
  })
  .forBrowser('electron')
  .build();

describe('Example tests', function(){

  it('Testing a thing on the page', function(done){
    driver.getTitle().then(function(title) {
      console.log('Page title is:', title);
      assert.equal('irc.app', title);
      done();
     }, function(arg){
       console.log('failure', arg);
       done('failure');
     });
  });

});