const fs=require("fs"),path=require("path"),r=path.join(__dirname,"..");
const w=(rel,c)=>{const p=path.join(r,rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,c)};
w("apps/api/tsconfig.json",JSON.stringify({extends:"../../tsconfig.json",compilerOptions:{outDir:"dist",rootDir:"src",module:"NodeNext",moduleResolution:"NodeNext"},include:["src"]}));
w("apps/api/src/hub.ts",[
'import type { ChatMessage, HubEvent } from "@omnichat/chat-types";',
'import type { WebSocket } from "ws";',
'const MAX=500;',
'export class ChatHub {',
'  private buffers=new Map<string,ChatMessage[]>();',
'  private rooms=new Map<string,Set<WebSocket>>();',
'  publish(roomId:string,event:HubEvent){',
'    if(event.type==="message"){const buf=this.buffers.get(roomId)??[];buf.push(event.message);if(buf.length>MAX)buf.splice(0,buf.length-MAX);this.buffers.set(roomId,buf);}',
'    const payload=JSON.stringify(event);',
'    for(const client of this.rooms.get(roomId)??[])if(client.readyState===1)client.send(payload);',
'  }',
'  subscribe(roomId:string,ws:WebSocket){if(!this.rooms.has(roomId))this.rooms.set(roomId,new Set());this.rooms.get(roomId).add(ws);for(const m of this.buffers.get(roomId)??[])ws.send(JSON.stringify({type:"message",message:m}));}',
'  unsubscribe(roomId:string,ws:WebSocket){this.rooms.get(roomId)?.delete(ws);}',
'  ingest(roomId:string,message:ChatMessage){this.publish(roomId,{type:"message",message});}',
'}'].join("\n"));
console.log("hub ok");
