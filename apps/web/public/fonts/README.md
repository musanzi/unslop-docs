# Entry-page fonts

The homepage and sign-in page use Newsreader for the heading and wordmark, and Inter for supporting text and controls. These are open-licensed substitutes chosen to resemble the supplied Claude reference. They are not Claude's exact fonts. Other pages retain their existing typography.

Both WOFF2 files are unmodified publisher distributions, served locally. Each font's copyright notice and SIL Open Font License 1.1 are included beside the font. The license permits bundling and redistribution with these notices.

| Font                         | Pinned distribution                                                                                                                                                                    | License                                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Newsreader, upright variable | [Production Type, revision cfcb4f7](https://github.com/productiontype/Newsreader/blob/cfcb4f7af0e52c25e8df2a2431814c8e5fe2e155/fonts/variable/woff2/Newsreader%5Bopsz%2Cwght%5D.woff2) | [Publisher's OFL](https://github.com/productiontype/Newsreader/blob/cfcb4f7af0e52c25e8df2a2431814c8e5fe2e155/OFL.txt), [local copy](newsreader/OFL.txt) |
| Inter 4.1, upright variable  | [Rasmus Andersson, revision e3a3d4c](https://github.com/rsms/inter/blob/e3a3d4c57d5ecc01453a575621882a384c1995a3/docs/font-files/InterVariable.woff2)                                  | [Publisher's OFL](https://github.com/rsms/inter/blob/e3a3d4c57d5ecc01453a575621882a384c1995a3/LICENSE.txt), [local copy](inter/OFL.txt)                 |

`sign-in.css` declares the font faces and applies the families only within the entry page. Both fonts use `font-display: swap`. No Claude font assets are bundled.
