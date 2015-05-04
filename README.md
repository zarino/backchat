# Backchat

A hackable IRC app for Mac OS X. Written in HTML and JavaScript, and run inside an [Electron](https://github.com/atom/electron) (previously *atom-shell*) wrapper.

# Developer set-up

To run the app using the Electron bootstrapper:

```
npm install
npm start
```

`npm start` automatically compiles the Sass stylesheets, checks the JavaScript files for syntax errors, and—if both of those things passed successfully—starts Backchat in the Electron bootstrapper.

# Compiling into a Mac app

```
npm run build
```