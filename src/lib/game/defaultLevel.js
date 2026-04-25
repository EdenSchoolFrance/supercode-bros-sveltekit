export const defaultLevel = `
<!-- ═══════════════════════════════
     SOL DU NIVEAU  (ligne 15 = bas)
     ═══════════════════════════════ -->
<h1 data-x="1"  data-y="15"></h1>
<h1 data-x="2"  data-y="15"></h1>
<h1 data-x="3"  data-y="15"></h1>
<h1 data-x="4"  data-y="15"></h1>
<h1 data-x="5"  data-y="15"></h1>
<h1 data-x="6"  data-y="15"></h1>
<h1 data-x="7"  data-y="15"></h1>
<h1 data-x="8"  data-y="15"></h1>
<h1 data-x="9"  data-y="15"></h1>
<h1 data-x="10" data-y="15"></h1>
<!-- TROU en colonne 11 : Mario peut tomber ! -->
<h1 data-x="12" data-y="15"></h1>
<h1 data-x="13" data-y="15"></h1>
<h1 data-x="14" data-y="15"></h1>
<h1 data-x="15" data-y="15"></h1>
<h1 data-x="16" data-y="15"></h1>
<h1 data-x="17" data-y="15"></h1>
<h1 data-x="18" data-y="15"></h1>
<h1 data-x="19" data-y="15"></h1>
<h1 data-x="20" data-y="15"></h1>
<h1 data-x="21" data-y="15"></h1>
<h1 data-x="22" data-y="15"></h1>
<h1 data-x="23" data-y="15"></h1>
<h1 data-x="24" data-y="15"></h1>
<h1 data-x="25" data-y="15"></h1>

<!-- ═══════════════════
     PLATEFORMES BRIQUES
     ═══════════════════ -->
<h2 data-x="4"  data-y="12"></h2>
<h2 data-x="5"  data-y="12"></h2>
<h2 data-x="6"  data-y="12"></h2>
<h2 data-x="7"  data-y="12"></h2>

<!-- ══════════════════
     BLOCS QUESTION (?)
     ══════════════════ -->
<h3 data-x="10" data-y="11"></h3>
<h3 data-x="14" data-y="10"></h3>
<h3 data-x="20" data-y="10"></h3>

<!-- ══════════
     TUYAUX
     ══════════ -->
<a id="tuyau-1" data-x="10" data-y="14" href="#tuyau-2"></a>
<a id="tuyau-2" data-x="13" data-y="14" href="#tuyau-1"></a>

<!-- ═════════════════════
     NUAGES (plateformes)
     ═════════════════════ -->
<h5 data-x="16" data-y="10"></h5>
<h5 data-x="17" data-y="10"></h5>
<h5 data-x="18" data-y="10"></h5>

<!-- ══════
     PIÈCES
     ══════ -->
<p data-x="4"  data-y="11"></p>
<p data-x="5"  data-y="11"></p>
<p data-x="6"  data-y="11"></p>
<p data-x="7"  data-y="11"></p>
<p data-x="10" data-y="10"></p>
<p data-x="16" data-y="9"></p>
<p data-x="17" data-y="9"></p>
<p data-x="18" data-y="9"></p>
<p data-x="20" data-y="9"></p>

<!-- ════════════════════════════════════
     ENNEMIS  (saute dessus pour vaincre)
     ════════════════════════════════════ -->
<input name="goomba" data-x="22" data-y="14" />

<!-- ═══════════════════════
     DRAPEAU (objectif final)
     ═══════════════════════ -->
<h6 data-x="25" data-y="11"></h6>
`.trim();
