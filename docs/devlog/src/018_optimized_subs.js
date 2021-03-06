
let auto = (obj) => {

    let running;     // what function is currently running
    let deps = {};   // list of dependencies for each function
    let fn = {};     // list of functions (runnable)
    let value = {};  // current actual values
    let stack = [];  // call stack
    let fatal = {};  // only set if fatal error occurs (and everything stops if this is set)
    let subs = {};   // special functions (ones which don't connect to a value) to run each time a value changes

    const res = {                             // return object
        _: { subs, fn, deps, value, fatal },  // so we can see from the outside what's going on
        '#': {}                               // subscribe methods for each member
    };

    let fail = (msg) => { 
        
        let _stack = []; stack.forEach(s => _stack.push(s));

        fatal.msg = msg;
        fatal.stack = _stack;
        
        if (fn['#fatal']) fn['#fatal'](res); // special function to react to fatal errors (so you can log to console / write to file / etc. on error)
    }

    let run_subs = (name) => {
        if (subs[name]) Object.key(subs[name]).forEach( tag => subs[name][tag](value[name]) )
    }

    let update = (name) => {   // update a function

        if (fatal.msg) return; // do nothing if a fatal error has occurred

        deps[name] = [];       // reset dependencies for this function
        running = name;        // globally set that we are running
        stack.push(name);

        if (stack.length>1 && stack[0] == stack[stack.length-1]) fail('circular dependency');
        else
        {
            let val = fn[name]();           // run the function
            if (!fatal.msg && name[0]!='#') // any function that starts with '#' is a function that doesn't save a corresponding value
            {
                if (val !== value[name])    // don't react if the value didn't change
                {
                    value[name] = val;
                    run_subs(name);         // we only want to run these if the value has actually changed
                }
            }  
        }
        
        stack.pop()
        running = undefined;
    }

    let getter = (name) => {

        if (fatal.msg) return; // do nothing if a fatal error occured

        if (running && deps[running].indexOf(name) === -1) deps[running].push(name);
        if (!(name in value)) update(name);
        return value[name];
    }

    let delete_deps = (name) => {

        Object.keys(deps).forEach( key => {
    
            deps[key].forEach( sub => {

                if (name == sub)
                {
                    delete(value[key]);
                    delete_deps(key);
                }
            })
        })
    }

    let setter = (name, val) => {

        if (fatal.msg) return; // do nothing if a fatal error occured

        if (running) fail("function "+running+" is trying to change value "+name)
        else {
            if (value[name] !== val)
            {
                value[name] = val;
                delete_deps(name);
                run_subs(name);
            }
        }
    }

    // get an available name for subscription
    let get_subtag = (name) => {

        let val = 0;
        let tag = () => val.toString().padStart(3, "0"); // e.g. #012
        while( subs[name] && tag() in subs[name] ) val += 1; // increment until not found
        return tag();
    }

    // this whole section is run once
    Object.keys(obj).forEach(name => {

        let prop;
    
        if (typeof obj[name] == 'function')
        {
            fn[name] = () => obj[name](res); // save function
            prop = { get() { return getter(name) }}             // what props to set on return object i.e. a getter
        }    
        else
        {
            value[name] = obj[name];
            prop = { get() { return getter(name) }, set(v) { setter(name, v) } }  // just set the return props i.e. getter + setter
        }

        Object.defineProperty(res, name, prop);

        res['#'][name] = {}
        res['#'][name].get = () => getter(name);
        res['#'][name].set = (v) => setter(name, v);
        res['#'][name].subscribe = (f) => {
    
            let subtag = get_subtag(name);
        
            if (!subs[name]) subs[name] = {}; // added this
            subs[name][subtag] = (v) => f(v); // now inside [name]
            
            f(value[name]);
        
            // return unsubscribe method
            return () => { delete(subs[name][subtag]); } // now inside [name]
        };
    });

    Object.keys(fn).forEach(name => update(name)); // boot process: update all functions, setting initial values and dependencies

    return res;
}
