import "dotenv/config";
import Discord, { TextChannel } from "discord.js";
import fetch from "node-fetch";
import { ethers } from "ethers";

const OPENSEA_SHARED_STOREFRONT_ADDRESS =
  "0x495f947276749Ce646f68AC8c248420045cb7b5e";

interface ContractConfig {
  name: string;
  address: string;
  slug: string;
}

const contracts: ContractConfig[] = [
  {
    name: "Immortal Phoenix",
    address: "0x7abc458a355beb1866bbf3563d48ad5a1c904621",
    slug: "immortalphoenix",
  },
  {
    name: "Planet XV",
    address: "0x4f80327c8dc498c4d8234d71bed1023230a5b785",
    slug: "planetxv",
  },
];

const discordBot = new Discord.Client();
const discordSetup = async (channel: string): Promise<TextChannel> => {
  const channelID = channel;
  return new Promise<TextChannel>((resolve, reject) => {
    if (!process.env["DISCORD_BOT_TOKEN"]) reject("DISCORD_BOT_TOKEN not set");
    discordBot.login(process.env.DISCORD_BOT_TOKEN);
    discordBot.on("ready", async () => {
      const channel = await discordBot.channels.fetch(channelID!);
      resolve(channel as TextChannel);
    });
  });
};

const buildMessage = (sale: any) =>
  new Discord.MessageEmbed()
    .setColor("#0099ff")
    .setTitle(sale.asset.name + " sold!")
    .setURL(sale.asset.permalink)
    .setAuthor(
      "Project X Sales Bot",
      "https://lh3.googleusercontent.com/pOAlgQz3eoClmN0RrVT2xNsqPLO2x5AqMAYK6IrN1lKM54gkretoGiThgpPppdxzbcfiFPNLBedA8MnmIUIV6HyQ_Yixs4zfQnwU=s130",
      "https://opensea.io/collection/planetxv"
    )
    .setThumbnail(sale.asset.collection.image_url)
    .addFields(
      { name: "Name", value: sale.asset.name },
      {
        name: "Amount",
        value: `${ethers.utils.formatEther(sale.total_price || "0")}${
          ethers.constants.EtherSymbol
        }`,
      },
      { name: "Buyer", value: sale?.winner_account?.address },
      { name: "Seller", value: sale?.seller?.address }
    )
    .setImage(sale.asset.image_url)
    .setTimestamp(Date.parse(`${sale?.created_date}Z`))
    .setFooter(
      "Sold on OpenSea",
      "https://files.readme.io/566c72b-opensea-logomark-full-colored.png"
    );

async function main() {
  for (const contract of contracts) {
    const seconds = process.env.SECONDS ? parseInt(process.env.SECONDS) : 3_600;
    const hoursAgo = Math.round(new Date().getTime() / 1000) - seconds; // in the last hour, run hourly?

    const params = new URLSearchParams({
      offset: "0",
      event_type: "successful",
      only_opensea: "false",
      occurred_after: hoursAgo.toString(),
      collection_slug: contract.slug,
    });

    if (contract.address !== OPENSEA_SHARED_STOREFRONT_ADDRESS) {
      params.append("asset_contract_address", contract.address);
    }

    let openSeaFetch = {};
    if (process.env.OPENSEA_TOKEN) {
      openSeaFetch["headers"] = { "X-API-KEY": process.env.OPENSEA_TOKEN };
    }

    let responseText = "";

    try {
      console.log(`Fetching Contract: ${JSON.stringify(contract, null, 4)}`);
      console.log(params);
      const openSeaResponseObj = await fetch(
        "https://api.opensea.io/api/v1/events?" + params,
        openSeaFetch
      );

      responseText = await openSeaResponseObj.text();

      const openSeaResponse = JSON.parse(responseText);

      console.log(`Found ${openSeaResponse?.asset_events?.length} Events.`);
      await Promise.all(
        openSeaResponse?.asset_events?.reverse().map(async (sale: any) => {
          if (sale.asset.name == null) sale.asset.name = "Unnamed NFT";

          const message = buildMessage(sale);

          return await Promise.all(
            process.env.DISCORD_CHANNEL_ID.split(";").map(
              async (channel: string) => {
                console.log("Sending Message: ", message);
                return await (await discordSetup(channel)).send(message);
              }
            )
          );
        })
      );
    } catch (e) {
      const payload = responseText || "";

      if (payload.includes("cloudflare") && payload.includes("1020")) {
        throw new Error(
          "You are being rate-limited by OpenSea. Please retrieve an OpenSea API token here: https://docs.opensea.io/reference/request-an-api-key"
        );
      }

      throw e;
    }
  }
}

main()
  .then((res) => {
    // if (!res.length) console.log("No recent sales");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
