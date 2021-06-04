const Web3 = require('web3')
const { Telegraf } = require('telegraf')
const Broadcaster = require('telegraf-broadcast')
const dedent = require('dedent')
const BigNumber = require('bignumber.js')
const Binance = require('node-binance-api')
const abiDecoder = require('abi-decoder')

const Energy8ABI = require('./abi/Energy8.abi.json')
const PancakeLPABI = require('./abi/PancakeLP.abi.json')

const binance = new Binance()

const SlimeAddress = '#'
const PancakeLPAddress = '#'
const WrappedBNBAddress = '#'

const TGChannel = '@E8Tracker'

const formatNumber = n => {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

const formatLongFloat = (n, precision = 15) => n.toFixed(precision).replace(/\.?0+$/,"")

const bot = new Telegraf(process.env.BOT_TOKEN)
const broadcaster = new Broadcaster(bot, { queueName: 'e8_bot' })

const web3 = new Web3(new Web3.providers.WebsocketProvider(process.env.WS_BSC_NODE, {
    reconnect: {
        auto: true,
    }
}))

const SlimeToken = new web3.eth.Contract(SlimeABI, SlimeAddress)
const PancakeLPToken = new web3.eth.Contract(PancakeLPABI, PancakeLPAddress)

bot.catch(() => {})
bot.start(Telegraf.reply(TGChannel))

abiDecoder.addABI([{
    'anonymous': false,
    'inputs': [
        {
            'indexed': true,
            'internalType': 'address',
            'name': 'from',
            'type': 'address',
        },
        {
            'indexed': true,
            'internalType': 'address',
            'name': 'to',
            'type': 'address',
        },
        {
            'indexed': false,
            'internalType': 'uint256',
            'name': 'value',
            'type': 'uint256',
        },
    ],
    'name': 'Transfer',
    'type': 'event',
}])

SlimeToken.events.Transfer()
    .on('data', async (event) => {
        const { transactionHash, returnValues } = event

        const receipt = await web3.eth.getTransactionReceipt(transactionHash)

        const decodedLogs = abiDecoder.decodeLogs(receipt.logs)
        const BNBEvent = decodedLogs.find(log => log.address === WrappedBNBAddress)

        if (BNBEvent) {
            const isSell = returnValues.to === PancakeLPAddress

            const BNBPrice = (await binance.prices('BNBUSDT')).BNBUSDT
            const reserves = await PancakeLPToken.methods.getReserves().call()
            const price = new BigNumber(reserves._reserve1).div(10**18).div(new BigNumber(reserves._reserve0).div(10**9)).times(BNBPrice)

            const E8Value = new BigNumber(returnValues.value).div(10**9).toFixed(0).toString()
            const BNBValue = Web3.utils.fromWei(BNBEvent.events[2].value)
            const roundedBNBValue = Math.ceil(BNBValue)

            const symbol = isSell ? '🔴' : '🟢'

            broadcaster.sendText(TGChannel, dedent`
                ${isSell ? '👹 Sold' : '⚡️ Bought'} <b>${formatNumber(E8Value)} E8</b> for <b>${parseFloat(BNBValue).toFixed(4).replace(/(\.0+|0+)$/, '')} BNB</b> on PancakeSwap

                ${symbol.repeat(Math.min(100, roundedBNBValue))}${roundedBNBValue > 100 ? `+${roundedBNBValue - 100}` : ''}

                <b>1 E8 = $${formatLongFloat(price, 12)}</b>

                🎮 <a href='https://slimetoken.com/'>Slime</a> - the first gamers token

                🥞 <a href='https://exchange.pancakeswap.finance/#/swap?outputCurrency=${SlimeAddress}'>Buy E8</a> | <a href='https://bscscan.com/tx/${transactionHash}'>Tx Hash</a> | <a href='https://poocoin.app/tokens/${SlimeAddress}'>Poocoin</a> | <a href='https://charts.bogged.finance/?token=${SlimeAddress}'>Bogget</a>
            `, { parse_mode: 'HTML', disable_web_page_preview: true })
        }
    })
    .on('error', console.log)

module.exports = bot
