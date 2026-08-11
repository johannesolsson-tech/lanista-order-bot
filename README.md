# Lanista Order Bot v3 — Railway

Den här versionen är gjord för Railway och kan använda ett Railway Volume för att spara beställningar mellan omstarter/deployments.

## Railway-variabler
Lägg in:
DISCORD_TOKEN=...
ORDER_CHANNEL_ID=...
DATA_DIR=/data

## Railway Volume
Skapa ett Volume och montera det på:
`/data`

Då lagras `orders.json` på volymen.

## Start
Railway använder:
`npm start`

## Lokalt
Om du kör lokalt kan du använda `.env`:
DISCORD_TOKEN=...
ORDER_CHANNEL_ID=...
DATA_DIR=.

Sedan:
`npm.cmd install`
`npm.cmd start`
