require("dotenv").config();
const fs=require("fs");
const path=require("path");
const {Client,GatewayIntentBits,Partials,PermissionsBitField}=require("discord.js");

const TOKEN=process.env.DISCORD_TOKEN;
const ORDER_CHANNEL_ID=process.env.ORDER_CHANNEL_ID;
const DATA_DIR=process.env.DATA_DIR||__dirname;

if(!TOKEN||!ORDER_CHANNEL_ID){
  console.error("DISCORD_TOKEN och ORDER_CHANNEL_ID måste finnas.");
  process.exit(1);
}

const DATA_FILE=path.join(DATA_DIR,"orders.json");
const ITEMS_FILE=path.join(__dirname,"items.json");
fs.mkdirSync(DATA_DIR,{recursive:true});

function loadJson(file,fallback){
  try{return JSON.parse(fs.readFileSync(file,"utf8"))}
  catch{return fallback}
}

const data=loadJson(DATA_FILE,{summaryMessageId:null,orders:{}});
const allowedItems=loadJson(ITEMS_FILE,[]);
if(!Array.isArray(allowedItems)||allowedItems.length===0){
  console.error("items.json saknas eller är tom.");
  process.exit(1);
}

function saveData(){
  fs.writeFileSync(DATA_FILE,JSON.stringify(data,null,2),"utf8");
}

const client=new Client({
  intents:[
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials:[Partials.Channel]
});

function simplify(text){
  return text.trim().replace(/\s+/g," ").toLocaleLowerCase("sv-SE");
}

const itemLookup=new Map(allowedItems.map(item=>[simplify(item),item]));

function parseOrder(content){
  const trimmed=content.trim();
  const match=trimmed.match(/^(.*?)(?:\s+(?:x?(\d+)|(\d+)x))?$/i);
  if(!match)return null;

  const rawItem=(match[1]||"").trim();
  const amount=parseInt(match[2]||match[3]||"1",10);

  if(!rawItem||!Number.isFinite(amount)||amount<1||amount>999)return null;

  const canonicalItem=itemLookup.get(simplify(rawItem));
  if(!canonicalItem)return null;

  return {item:canonicalItem,amount};
}

function buildSummary(){
  const items=Object.entries(data.orders)
    .filter(([,users])=>Object.keys(users).length>0)
    .sort(([a],[b])=>a.localeCompare(b,"sv"));

  if(items.length===0){
    return [
      "📦 **BESTÄLLNINGAR**",
      "",
      "_Inga aktiva beställningar._",
      "",
      "Skriv ett godkänt föremålsnamn, t.ex. `Bhorgolpäls` eller `Bhorgolpäls 3`."
    ].join("\n");
  }

  const lines=["📦 **BESTÄLLNINGAR**",""];

  for(const [item,users] of items){
    lines.push(`**${item}**`);
    for(const [userId,amount] of Object.entries(users).sort(([,a],[,b])=>b-a)){
      lines.push(amount>1?`<@${userId}> ×${amount}`:`<@${userId}>`);
    }
    lines.push("");
  }

  lines.push("_`-Bhorgolpäls` tar bort din egen beställning._");
  lines.push("_Admin: `!beställningar rensa` tömmer hela listan._");
  return lines.join("\n");
}

async function updateSummary(channel){
  const content=buildSummary();
  let summaryMessage=null;

  if(data.summaryMessageId){
    try{summaryMessage=await channel.messages.fetch(data.summaryMessageId)}
    catch{data.summaryMessageId=null}
  }

  if(!summaryMessage){
    summaryMessage=await channel.send({
      content:content.slice(0,2000),
      allowedMentions:{parse:[]}
    });
    data.summaryMessageId=summaryMessage.id;
    saveData();
  }else{
    await summaryMessage.edit({
      content:content.slice(0,2000),
      allowedMentions:{parse:[]}
    });
  }
}

client.once("ready",async()=>{
  console.log(`Inloggad som ${client.user.tag}`);
  console.log(`${allowedItems.length} godkända föremål laddade`);
  try{
    const channel=await client.channels.fetch(ORDER_CHANNEL_ID);
    if(!channel||!channel.isTextBased())throw new Error("ORDER_CHANNEL_ID pekar inte på en textkanal.");
    await updateSummary(channel);
    console.log("Beställningslistan är redo.");
  }catch(err){
    console.error("Kunde inte initiera beställningskanalen:",err);
  }
});

client.on("messageCreate",async message=>{
  try{
    if(message.author.bot)return;
    if(message.channel.id!==ORDER_CHANNEL_ID)return;

    const content=message.content.trim();

    if(
      content.toLowerCase()==="!beställningar rensa" &&
      message.member?.permissions.has(PermissionsBitField.Flags.ManageGuild)
    ){
      data.orders={};
      saveData();
      await message.delete().catch(()=>{});
      await updateSummary(message.channel);
      return;
    }

    if(content.startsWith("-")){
      const canonicalItem=itemLookup.get(simplify(content.slice(1)));

      // Inte ett giltigt Kajsa-föremål -> lämna meddelandet kvar.
      if(!canonicalItem)return;

      if(data.orders[canonicalItem]?.[message.author.id]){
        delete data.orders[canonicalItem][message.author.id];
        if(Object.keys(data.orders[canonicalItem]).length===0){
          delete data.orders[canonicalItem];
        }
        saveData();
      }

      await message.delete().catch(()=>{});
      await updateSummary(message.channel);
      return;
    }

    const order=parseOrder(content);

    // VIKTIG ÄNDRING:
    // Vanliga meddelanden rörs inte alls.
    if(!order)return;

    if(!data.orders[order.item])data.orders[order.item]={};

    data.orders[order.item][message.author.id]=
      (data.orders[order.item][message.author.id]||0)+order.amount;

    saveData();

    // Bara riktiga beställningsmeddelanden raderas.
    await message.delete().catch(err=>{
      console.error("Kunde inte radera beställningsmeddelandet:",err.message);
    });

    await updateSummary(message.channel);
  }catch(err){
    console.error("Fel vid hantering av meddelande:",err);
  }
});

client.login(TOKEN);