const adapter = require("./promise-aplus").default

const runner = require("promises-aplus-tests")
runner(adapter, (err) => {
    console.log(err)
})
