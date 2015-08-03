# Backchat

A hackable IRC app for Mac OS X. Written in HTML and JavaScript, and run inside an [Electron](https://github.com/atom/electron) (previously *atom-shell*) wrapper.

## Developer set-up

To run the app using the Electron bootstrapper:

```
npm install
./node_modules/.bin/electron-rebuild
npm start
```

`electron-rebuild` must be run after you install or update packages, to ensure packages are compiled for an electron-compatible version of Node. (If you get errors like `Module version mismatch. Expected 44, got 14.` it’s because you’ve not run `electron-rebuild`.)

`npm start` automatically compiles the Sass stylesheets, checks the JavaScript files for syntax errors, and—if both of those things passed successfully—starts Backchat in the Electron bootstrapper.

## Compiling into a Mac app

```
npm run build
```

## Running the tests

There are very limited integration tests. They use [selenium-webdriver](https://www.npmjs.com/package/selenium-webdriver) and [chromedriver](https://github.com/giggio/node-chromedriver), along with [mocha](http://mochajs.org) as a test runner – all of which are included as dev dependencies in `package.json`.

To run the tests:

```
npm install
npm test
```

Since the tests must be run on a compiled version of the Electron app, `npm test` first builds the app, and then runs the tests on it. Just like `npm run build`, it checks for javascript syntax errors before compiling.

While running `mocha`, `npm test` sets the `BACKCHAT_DEBUG` environment variable, which causes `server/main.js` to load test fixtures rather than real user data, and to output more detailed console logs.
