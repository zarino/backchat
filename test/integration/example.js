var assert = require('assert');
var helper = require('../integration-helper.js');
var wd = require('../wadsworth.js')

describe('Testing the browser window', function(){

  before(function(){
    helper.chromedriver.start();
    this.server = helper.startServer();
    this.browser = helper.createBrowser();
    wd.browser = this.browser;
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
    wd.getElement('.app-sidebar + .app-content', function(){
      done();
    })
  });

  it('Sidebar contains connected server name', function(done){
    wd.getElements('.app-sidebar .channel-list h1', function(elements){
      assert.equal(elements.length, 1);
      elements[0].getText().then(function(text){
        assert.equal(text, 'localhost');
        done();
      });
    });
  });

  it('Sidebar contains connected channel name', function(done){
    wd.getElements('.channel-list button', function(elements){
      assert.equal(elements.length, 1);
      elements[0].getText().then(function(text){
        assert.equal(text, '#channel1');
        done();
      });
    });
  });

  describe('Clicking a channel in the sidebar', function(){

    before(function(done){
      self = this;
      wd.getElements('.channel-list button', function(elements){
        self.channelButton = elements[0];
        self.channelButton.click().then(function(){
          done();
        });
      });
    });

    it('Reveals the channel in the main window', function(done){
      wd.getVisible('.channel', function(){
        done();
      });
    });

    it('Shows users in that channel', function(done){
      wd.getVisible('.channel__users button', function(){
        done();
      });
    });

    it('Shows the channel as selected in the sidebar', function(done){
      wd.hasClass(this.channelButton, 'active', function(hasClass){
        if(hasClass){
          done();
        }
      });
    });

  });

  after(function(){
    this.browser.quit();
    helper.chromedriver.stop();
  });

});
