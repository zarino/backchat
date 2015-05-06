# Backchat

A hackable IRC app for Mac OS X. Written in HTML and JavaScript, and run inside an [Electron](https://github.com/atom/electron) (previously *atom-shell*) wrapper.

## Developer set-up

To run the app using the Electron bootstrapper:

```
npm install
npm start
```

`npm start` automatically compiles the Sass stylesheets, checks the JavaScript files for syntax errors, and—if both of those things passed successfully—starts Backchat in the Electron bootstrapper.

## Compiling into a Mac app

```
npm run build
```

## Running the tests

There are very limited integration tests. Make sure to set up your environment before starting:

```
npm install
brew install chromedriver
```

Then start a Chromedriver instance for the tests to connect to:

```
npm run chromedriver
```

And in a new window, run the tests:

```
npm test
```

`./scripts/chromedriver` sets the `BACKCHAT_DEBUG` environment variable, which causes `server/main.js` to load test fixtures rather than real user data, and to output more detailed console logs.
