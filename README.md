# Backchat

A hackable IRC app for Mac OS X. Written in HTML and JavaScript, and run inside an [Electron](https://github.com/atom/electron) (previously *atom-shell*) wrapper.

# Developer set-up

To run the app using the Electron bootstrapper:

1. Download the [latest release of Electron](https://github.com/atom/electron/releases) for your operating system (eg: “darwin” for Mac users).
2. Unzip the Electron package and move Electron.app into your Applications folder.
3. Run `npm start` from the base level of this repo.

`npm start` automatically compiles the Sass stylesheets, checks the JavaScript files for syntax errors, and—if both of those things passed successfully—starts Backchat in the Electron bootstrapper.