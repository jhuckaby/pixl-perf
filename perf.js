// High Resolution Performance Tracker for Node.JS
// Copyright (c) 2014 Joseph Huckaby
// Released under the MIT License

var Util = require('util');
var Class = require("pixl-class");

module.exports = Class.create({
	
	perf: null,
	counters: null,
	scale: 1000, // milliseconds
	precision: 1000, // 3 digits
	totalKey: 'total', // where to store the total
	
	__events: false,
	
	__construct: function() {
		// class constructor
		this.reset();
	},
	
	reset: function() {
		// reset everything
		this.perf = {};
		this.counters = {};
	},
	
	setScale: function(scale) { 
		// set scale for time measurements
		// 1000000000 == nanoseconds
		// 1000000 == microseconds
		// 1000 == milliseconds
		// 1 == seconds
		this.scale = scale; 
	},
	
	setPrecision: function(precision) {
		// set precision for measurements
		// 1 == integers only
		// 10 == 1 digit after the decimal
		// 100 == 2 digits after the decimal
		// 1000 == 3 digits after the decimal
		this.precision = precision; 
	},
	
	calcElapsed: function(start) {
		// calculate elapsed time using process.hrtime() (nanoseconds)
		// then convert to our scale and precision
		var diff = process.hrtime( start );
		var nano = diff[0] * 1e9 + diff[1];
		
		// apply scale transform
		var value = nano / (1000000000 / this.scale);
		
		return value;
	},
	
	begin: function(id) {
		// begin tracking metric
		// ID defaults to 't' for total
		if (!id) id = this.totalKey;
		var now = process.hrtime();
		
		// only allow 't' begin to be called once per object (unless it is reset)
		if ((id == this.totalKey) && this.perf[id]) return;
		
		// set start time
		if (!this.perf[id]) this.perf[id] = { elapsed: 0 };
		this.perf[id].start = now;
		if (this.perf[id].end) delete this.perf[id].end;
		
		return new PerfMetric(this, id, now);
	},
	
	end: function(id, start) {
		// mark end of metric
		// ID defaults to 't' for total
		if (!id) id = this.totalKey;
		var now = process.hrtime();
		
		if (!this.perf[id] && !start) return;
		if (!this.perf[id]) this.perf[id] = { elapsed: 0 };
		var obj = this.perf[id];
		
		if (start) obj.start = start;
		obj.end = now;
		if (!obj.start) obj.start = obj.end;
		
		var elapsed = Util.isArray(obj.start) ? 
			this.calcElapsed( obj.start ) : 0;
		
		if (id == this.totalKey) {
			// end of all tracking
			// set elapsed instead of incrementing, to prevent bugs with calling end() twice.
			obj.elapsed = elapsed;
		}
		else {
			// stopped tracking single metric
			// increment elapsed to allow for multiple trackings on same metric
			obj.elapsed += elapsed;
		}
	},
	
	count: function(id, amount) {
		// increment (or decrement) simple counter, unrelated to time measurement
		if (typeof(amount) == 'undefined') amount = 1;
		if (!(id in this.counters)) this.counters[id] = amount;
		else this.counters[id] += amount;
	},
	
	metrics: function() {
		// get all perf metrics and counters in simple object format
		var out = {};
		
		// make sure total metric is ended
		this.end();
		
		// generate object containing only elapsed times of each
		for (var id in this.perf) {
			if (this.perf[id].end) {
				out[id] = this.elapsed(id, true);
			}
		}
		
		return {
			scale: this.scale,
			perf: out,
			counters: this.counters
		};
	},
	
	json: function() {
		// return a JSON string with perf metrics and counters separated out
		return JSON.stringify( this.metrics() );
	},
	
	summarize: function() {
		// Summarize performance metrics in query string format
		var pairs = [];
		var metrics = this.metrics();
		
		// prefix with scale
		pairs.push( 'scale=' + this.scale );
		
		// make sure total is always right after scale
		pairs.push( 'total=' + metrics.perf.total );
		delete metrics.perf.total;
		
		// build summary string of other metrics
		for (var id in metrics.perf) {
			pairs.push( id + '=' + metrics.perf[id] );
		}
		
		// add counters if applicable, prefix each with c_
		for (var id in metrics.counters) {
			var disp_id = id.match(/^c_/) ? id : ('c_'+id);
			pairs.push( disp_id + '=' + metrics.counters[id] );
		}
		
		return pairs.join('&');
	},
	
	elapsed: function(id, display_format) {
		// get elapsed seconds from given metric
		if (!this.perf[id]) return 0;
		if (!this.perf[id].elapsed) return 0;
		
		if (display_format) {
			return Math.floor(this.perf[id].elapsed * this.precision) / this.precision;
		}
		else return this.perf[id].elapsed;
	},
	
	get: function() {
		// Get raw perf object
		return this.perf;
	},
	
	getCounters: function() {
		// Get raw counters object
		return this.counters;
	},
	
	import: function(perf, prefix) {
		// import perf metrics from another object (and adjust scale to match)
		// can be a pixl-perf instance, or an object from calling metrics()
		if (!prefix) prefix = '';
		
		if (perf.perf) {
			for (var key in perf.perf) {
				if (key != this.totalKey) {
					var pkey = prefix + key;
					if (!this.perf[pkey]) this.perf[pkey] = {};
					if (!this.perf[pkey].end) this.perf[pkey].end = 1;
					if (!this.perf[pkey].elapsed) this.perf[pkey].elapsed = 0;
					var elapsed = (typeof(perf.perf[key]) == 'number') ? perf.perf[key] : perf.perf[key].elapsed;
					this.perf[pkey].elapsed += (elapsed / (perf.scale / this.scale)) || 0;
				}
			}
		}
		
		if (perf.counters) {
			for (var key in perf.counters) {
				var pkey = prefix + key;
				this.count( pkey, perf.counters[key] );
			}
		}
	}
	
});

// A PerfMetric promise is returned from each call to begin(),
// so the user can track multiple simultaneous metrics with the same key.

var PerfMetric = Class.create({
	
	__events: false,
	
	perf: null,
	id: '',
	start: 0,
	
	__construct: function(perf, id, start) {
		// class constructor
		this.perf = perf;
		this.id = id;
		this.start = start;
	},
	
	end: function() {
		// end tracking
		this.perf.end(this.id, this.start);
	}
	
});
