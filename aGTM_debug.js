//[aGTMlib_debug.js]BOF

/**
 * Debug Functionallity for aGTMlib - this is a part of aGTMlib and cannot be used standalone
 * @version 1.0
 * @lastupdate 30.03.2024 by Andi Petzoldt <andi@petzoldt.net>
 * @author Andi Petzoldt <andi@petzoldt.net>
 * @usage use it together with aGTMlib and see the documentation there
 */

// Initialitialize the objects
window.aGTM = window.aGTM || {};
aGTM.d = aGTM.d || { config: false, init: false, fired: false };
aGTM.f = aGTM.f || {};
aGTM.l = aGTM.l || [];

// Debug message map
aGTM.d.logmap = aGTM.d.logmap || {
   e1:  { type:'err', msg:'call of function aGTM.f.config, but config was already set' }
  ,e2:  { type:'err', msg:'call of function aGTM.f.consent_check, but you need to run the config before' }
  ,e3:  { type:'err', msg:'aGTM.f.consent_check called, but action argument (a) is not valid' }
  ,e4:  { type:'err', msg:'call of function aGTM.f.consent, but you need to run the config before' }
  ,e5:  { type:'err', msg:'aGTM.f.consent called, but action argument (a) is not valid' }
  ,e6:  { type:'err', msg:'' }
  ,e7:  { type:'err', msg:'call of function aGTM.f.tm_init, but you need to run the config before' }
  ,e8:  { type:'err', msg:'call of function aGTM.f.tm_inject, but you need to run the config before' }
  ,e9:  { type:'err', msg:'aGTM.f.fire called, but argument is not an object' }
  ,e10: { type:'err', msg:'aGTM.f.consent_check called, but action argument (a) is not valid' }
  ,e11: { type:'err', msg:'aGTM.f.addEvListener called, but one argument is not valid' }
  ,e12: { type:'err', msg:'aGTM.f.addEvListener called, but there is a problem with with addEventListener' }
  ,e13: { type:'err', msg:'call of function aGTM.f.tm_inject, but consent not available' }
  ,e14: { type:'err', msg:'call of function aGTM.f.run_cc, but consent_check function not available' }
  ,m1:  { type:'msg', msg:'aGTM.f.config was successful set' }
  ,m2:  { type:'msg', msg:'aGTM.f.consent_check has checked the consent and consent is available now' }
  ,m3:  { type:'msg', msg:'Consent Setup complete' }
  ,m5:  { type:'msg', msg:'GTAG initial call injected' }
  ,m6:  { type:'msg', msg:'GTM initial call injected' }
  ,m7:  { type:'msg', msg:'Event fired' }
  ,m8:  { type:'msg', msg:'Consent Setup called, but consent not (yet) available' }
};

/**
 * Function to get the error and log messages to the browser console
 * It also returns an object with the messages
 * @property {function} aGTM.f.view_log
 * @returns {object} - object with error and log messages
 * Usage: aGTM.f.view_log();
 */
aGTM.f.view_log = function () {
  if (!aGTM.l) { console.log('no log messages available'); return {}; }
  for (var i=0; i<aGTM.l.length; i++) {
    var id = aGTM.l[i].id;
    if (typeof id!='string') continue;
    var timestamp = aGTM.l[i].timestamp;
    var time = new Date(aGTM.l[i].timestamp);
    var timestring = time.getFullYear() + '-' + time.getMonth() + '-' +time.getDate() + ' ' + time.getHours() + ':' + time.getMinutes() + ':' + time.getSeconds() + ':' + time.getMilliseconds();
    var obj = aGTM.l[i].obj;
    if (typeof aGTM.d.logmap[id]!='object') continue;
    var type = aGTM.d.logmap[id].type;
    var msg = aGTM.d.logmap[id].msg;
    aGTM.l[i].type = type;
    aGTM.l[i].msg = msg;
    aGTM.l[i].timestring = timestring;
    var t = type=='err' ? 'Error' : 'Message';
    console.log('aGTMlib '+t+': '+msg+' ['+timestring+']',obj);
  }
  return aGTM.l;
};

//[aGTMlib_debug.js]EOF