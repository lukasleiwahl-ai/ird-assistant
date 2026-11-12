const {send,config}=require('../lib/connection');
module.exports=async(req,res)=>{if(req.method!=='GET')return send(res,405,{ok:false,error:'Method not allowed'});const c=config();return send(res,200,{ok:true,connected:!!(c.scriptUrl&&c.spreadsheetId),spreadsheetConfigured:!!c.spreadsheetId,scriptConfigured:!!c.scriptUrl});};
