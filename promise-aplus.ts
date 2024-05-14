const Utils = {
    isObject:   (val: any) => !!val && typeof val === 'object',
    isFunction: (val: any) => !!val && typeof val === 'function',
    isPromise:  (val: any): val is PromiseAPlus => !!val && val.constructor === PromiseAPlus,
    runAsync:   (fn: Function) => setTimeout(fn, 0)
}

/**
 * https://promisesaplus.com/
 * Promise A+ specs
 * */

/**
 * ## 2.1 Promise States
 * 状态必须在以下三种状态之一:
 *   pending, fulfilled, or rejected。
 * */
const enum PromiseState{
    PENDING     = 0,
    FULFILLED   = 1,
    REJECTED    = 2,
}

type PromiseAPlusResolve<T> = (value: T | PromiseLike<T>) => void
type PromiseAPlusReject = (reason?: any) => void
type PromiseAPlusExecutor<T> = (resolve: PromiseAPlusResolve<T>, reject: PromiseAPlusReject) => void

class PromiseAPlus<T = any> {
    static isValidState(val: any): val is PromiseState {
        return val === PromiseState.PENDING
            || val === PromiseState.FULFILLED
            || val === PromiseState.REJECTED
    }

    state: PromiseState = PromiseState.PENDING

    private value: any | null = null
    private queue: PromiseAPlus[] = []

    private handler: {
        fullFill: (value: any) => any
        reject: (reason: any) => any
    } = {
        fullFill: null,
        reject: null
    }

    constructor(fn?: PromiseAPlusExecutor<T>) {
        if (Utils.isFunction(fn)) {
            fn(
                (value: T) => PromiseAPlus.Resolve(this, value),
                (reason: any) => this.reject(reason)
            )
        }
    }

    /**
     * 2.3 Promise处理程序
     * */
    private static Resolve(promise: PromiseAPlus, x: any) {
        if (promise === x) {
            /** 2.3.1 如果promise 和 value 是同一个对象，则返回以此为原因的TypeError */
            promise.transition(PromiseState.REJECTED, new TypeError("The promise and its value refer to the same object"))
        } else if (Utils.isPromise(x)) {
            /** 2.3.2 如果x是Promise， 则参数promise采用x的状态 */
            if (x.state === PromiseState.PENDING) {
                /** 2.3.2.1 promise需要等待x的pending结束，采用x的结果 */
                x.then(
                    (value) => PromiseAPlus.Resolve(promise, value),
                    (reason) => promise.transition(PromiseState.REJECTED, reason)
                )
            } else {
                /* 2.3.2.2/3 x不是pending, 则直接更改promise的状态 */
                promise.transition(x.state, x.value)
            }
        } else if (Utils.isObject(x) || Utils.isFunction(x)) {
            let called = false
            try {
                let then = x.then
                if (Utils.isFunction(then)) {
                    /**
                     * 2.3.3.3 如果then（x.then）是function，
                     * 2.3.3.3.1/2 以x的this调用then，第一个参数是resolvePromise，第二个参数是rejectPromise
                     * 2.3.3.3/4 使用called标记首次调用，忽略第二次或剩下的调用
                     * */
                    const resolvePromise = (y: any) => {
                        if (!called) {
                            // noinspection JSSuspiciousNameCombination
                            PromiseAPlus.Resolve(promise, y)
                            called = true
                        }
                    }
                    const rejectPromise = (r: any) => {
                        if (!called) {
                            promise.transition(PromiseState.REJECTED, r)
                            called = true
                        }
                    }
                    then.call(x, resolvePromise, rejectPromise)
                } else {
                    promise.fullfill(x)
                    called = true
                }
            } catch (error) {
                /** 2.3.3.2 如果获取then属性出错，在这儿抛出 */
                if (!called) {
                    called = true
                    promise.transition(PromiseState.REJECTED, error)
                }

            }
        } else {
            promise.fullfill(x)
        }
    }

    private transition(state: PromiseState, value: any) {
        if (
            this.state === state
            || this.state !== PromiseState.PENDING
            || !PromiseAPlus.isValidState(state)
        ){
            return
        }
        this.value = value
        this.state = state

        this.process()
    }
    private fullfill(value: T) {
        this.transition(PromiseState.FULFILLED, value)
    }
    private reject(reason: any) {
        this.transition(PromiseState.REJECTED, reason)
    }

    private process() {
        const defaultFullFill = (value: any) => value
        const defaultReject = (reason: any) => { throw reason }

        if (this.state === PromiseState.PENDING) {
            return
        }
        Utils.runAsync(() => {
            while (this.queue.length) {
                const promise = this.queue.shift()

                let handler: (value: any) => any
                if (this.state === PromiseState.FULFILLED) {
                    handler = promise.handler.fullFill || defaultFullFill
                } else {
                    handler = promise.handler.reject || defaultReject
                }

                let value: any
                try {
                    value = handler(this.value)
                } catch (error) {
                    promise.transition(PromiseState.REJECTED, error)
                    continue
                }
                PromiseAPlus.Resolve(promise, value)
            }
        })
    }
    /**
     * ## 2.2 The `then` Method
     * ```js
     * promise.then(onFulfilled, onRejected)
     * ```
     * */

    /**
     * 2.2.1. `onFulfilled` 和 `onRejected` 都是可选的参数：
     *     1. 如果 `onFulfilled` 不是一个函数，它必须被忽略。
     *     2. 如果 `onRejected` 不是一个函数，它必须被忽略。
     * 2.2.7 then 必须返回一个新的 promise
     *      ```js
     *      promise2 = promise1.then(onFulfilled, onRejected)
     *      ```
     * */
    then<R>(onFulfilled?: (value: T) => R, onRejected?: (reason: any) => any): PromiseAPlus<R> {
        const promise = new PromiseAPlus<R>()

        if (Utils.isFunction(onFulfilled)) {
            promise.handler.fullFill = onFulfilled
        }
        if (Utils.isFunction(onRejected)) {
            promise.handler.reject = onRejected
        }
        this.queue.push(promise)
        this.process()

        return promise
    }
}

export default {
    resolved: (value: any) => {
        return new PromiseAPlus((resolve) => {
            resolve(value)
        })
    },
    rejected: (reason: any) => {
        return new PromiseAPlus((_, reject) => {
            reject(reason)
        })
    },
    deferred: () => {
        let resolve: (value: any) => void
        let reject: (reason: any) => void
        const promise = new PromiseAPlus((_resolve, _reject) => {
            resolve = _resolve
            reject = _reject
        })
        return {
            promise,
            resolve,
            reject
        }
    }
}
