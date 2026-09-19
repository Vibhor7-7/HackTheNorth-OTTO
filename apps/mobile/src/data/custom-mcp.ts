import AsyncStorage from '@react-native-async-storage/async-storage';
export interface CustomMcp {id:string;name:string;url:string;createdAt:string}
const KEY='otto.custom-mcp.demo.v1';
export function validateMcp(name:string,input:string):{name:string;url:string}{
 const label=name.trim();if(!label||label.length>60)throw new Error('Enter a name between 1 and 60 characters.');
 let url:URL;try{url=new URL(input.trim());}catch{throw new Error('Enter a valid HTTPS server URL.');}
 if(url.protocol!=='https:'||!url.hostname)throw new Error('Use an HTTPS server URL.');
 if(url.username||url.password||url.search||url.hash)throw new Error('Use a URL without credentials, query parameters or fragments.');
 return {name:label,url:url.toString()};
}
export async function loadCustomMcp():Promise<CustomMcp[]>{const raw=await AsyncStorage.getItem(KEY);if(!raw)return [];const parsed:unknown=JSON.parse(raw);if(!Array.isArray(parsed))return [];return parsed.filter((v):v is CustomMcp=>typeof v?.id==='string'&&typeof v?.name==='string'&&typeof v?.url==='string'&&typeof v?.createdAt==='string');}
export async function saveCustomMcp(items:CustomMcp[]){await AsyncStorage.setItem(KEY,JSON.stringify(items));}
