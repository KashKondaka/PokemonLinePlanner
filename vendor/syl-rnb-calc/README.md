# syl-rnb-calc (vendored)

This directory contains the compiled output of the `syl-rnb-calc` Pokemon
damage calculator.

It is used solely for the AI move probability distribution feature
(`generateMoveDist` in `ai.js`), which predicts what move an AI trainer
is likely to use based on battle state.

## Source

- Original repository: syl-rnb-calc (private / local)
- Based on: @smogon/calc v0.7.0 with custom AI scoring logic
- Files copied from: `syl-rnb-calc/calc/dist/`

## Updating

To update this vendored copy after making changes to syl-rnb-calc:

```bash
cd ~/Documents/syl-rnb-calc/calc
npm run compile
cp -R dist/* ~/Documents/PokemonLinePlanner/vendor/syl-rnb-calc/
```
