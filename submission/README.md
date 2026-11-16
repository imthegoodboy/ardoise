# Submission materials

| File                                       | What it is                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`ardoise-demo.mp4`](ardoise-demo.mp4)     | 2 min 43 s narrated demo, 1080p, English with burned-in subtitles. Every screen was recorded on the live deployment (https://ardoise-dakar.vercel.app): a demo shop, a WhatsApp pay link, an invoice issued by a real Nostr Wallet Connect wallet over public relays (faucet.nwc.dev, play-money sats), settlement, the receipt's proof checked in the browser, the shop's live payment alert, and the notebook import read by Gemini. |
| [`Ardoise-pitch.pptx`](Ardoise-pitch.pptx) | 13-slide pitch deck with speaker notes: problem, users, product flow, Lightning integration, security, low-bandwidth design, architecture, MVP proof, impact, next iteration.                                                                                                                                                                                                                                                          |

Figures quoted: remittances ≈ 11 % of Senegal's GDP (World Bank WDI, 2024); average cost of sending
$200 to Sub-Saharan Africa 8.46 % (World Bank Remittance Prices Worldwide, Q3 2025); UN SDG 10.c
target 3 %. The reach estimate on slide 11 is an explicit assumption to validate in a pilot.

How the video was made: the flow was driven by a Playwright script against production, narrated with
a neural text-to-speech voice, and assembled with ffmpeg (long waits, such as the AI reading a page,
are shortened in the edit and nothing else is altered).
