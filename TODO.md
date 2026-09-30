# To do

## Duurzaamheid en andere verschillen buiten de prijs

Nu vergelijkt het project alleen wat een leverancier rekent. Contracten verschillen ook op andere punten. Die willen we per leverancier vastleggen in `kenmerken`, met bron en controledatum, net als de tarieven.

- **Duurzaamheid**
  - Herkomst van de stroom volgens het stroometiket: Nederlandse wind en zon, Europese GvO's of grijs.
  - Gas: grijs, CO₂-gecompenseerd of groen gas.
  - Budget Thuis biedt bij Independer een tweede, duurzamer dynamisch contract aan. In de eigen rekentool van Budget (propositie `Budget Energie Dynamisch`, `isGreenProposition: false`) staat het niet. Uitzoeken hoe het heet en of Budget het zelf publiceert. Zo ja, als apart bestand toevoegen.
- **Prijsinterval stroom**: per kwartier, per uur of zelf te kiezen.
- **Zonnepanelen**
  - Mag dynamisch met eigen opwek? Zonopnaam zet het contract bij teruglevering om naar variabel.
  - Slim terugleveren of automatisch afschakelen bij negatieve prijzen (`automatischAfschakelen` staat nu bijna overal op `null`).
- **Sturing en apps**: thuisbatterij, laadpaal of warmtepomp koppelen, en een app met prijzen.
- **Contract**
  - Opzegtermijn.
  - Alleen stroom mogelijk.
  - Combinatie van dynamische stroom met vast gas.
  - Welkomstkorting (eenmalig, zit niet in de tarieven).
- **Betalen**: vast voorschot, maandelijks herberekend voorschot of achteraf.

## Leveranciers

- **Mega**: de gastarieven (vaste kosten en opslag) ontbreken nog. De stroomwaarden zijn met de hand gelezen in de rekentool, want die zit achter een botcontrole. Ze moeten dus ook met de hand bijgehouden worden.
- **Zonopnaam**: het tarievenblad wordt per maand vervangen (nu september 2026). Een adapter die het nieuwste tarievenblad leest, houdt dit bij.
