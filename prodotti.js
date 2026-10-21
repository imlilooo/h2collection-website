// ─────────────────────────────────────────────────────────────
// ELENCO CAPI DELLA COLLEZIONE
// Per aggiungere un capo: copia una riga e cambia i valori.
//  - id:         nome breve per il link (minuscolo, con trattini)
//  - nome:       nome che appare sul sito
//  - categorie:  una o più tra pantaloni capispalla tailleurs top maglieria abiti
//  - foto:       file in images/products/ — la PRIMA è quella in griglia
//                (ghost mannequin), la seconda appare passando col mouse
// ─────────────────────────────────────────────────────────────
var PRODOTTI = [
  { id: "abito-camicia-floreale", nome: "Abito camicia floreale", categorie: "abiti", foto: ["Abito_camicia_floreale.webp"] },
  { id: "maxi-dress-floreale", nome: "Maxi dress floreale", categorie: "abiti", foto: ["Maxi_dress_floreale.webp"] },
  { id: "pantaloni-balloon", nome: "Pantaloni balloon", categorie: "pantaloni", foto: ["Pantaloni_balloon.webp"] },
  { id: "pantapalazzo", nome: "Pantapalazzo", categorie: "pantaloni", foto: ["Pantapalazzo.webp"] },
  { id: "giacca-in-pelle", nome: "Giacca in pelle", categorie: "capispalla", foto: ["Giacca_in_pelle.webp"] },
  { id: "giacca-in-pelle-con-collo-alto", nome: "Giacca in pelle con collo alto", categorie: "capispalla", foto: ["Giacca_in_pelle_con_collo_alto.webp"] },
  { id: "tailleur", nome: "Tailleur", categorie: "tailleurs", foto: ["Tailleur.webp"] },
  { id: "completo-in-velluto-a-costine", nome: "Completo in velluto a costine", categorie: "tailleurs", foto: ["Completo_in_velluto_a_costine.webp"] },
  { id: "cardigan-con-bottoni-rivestiti", nome: "Cardigan con bottoni rivestiti", categorie: "maglieria top", foto: ["Cardigan_con_bottoni_rivestiti_still.webp", "Cardigan_con_bottoni_rivestiti.webp"] },
  { id: "cardigan-cherie", nome: "Cardigan Cherie", categorie: "maglieria top", foto: ["Cardigan_con_tasche_still.webp", "Cardigan_con_tasche.webp"] },
  { id: "maglione-con-manica-scesa", nome: "Maglione con manica scesa", categorie: "maglieria top", foto: ["Maglione_con_manica_scesa_still.webp", "Maglione_con_manica_scesa.webp"] },
  { id: "polo-in-maglia", nome: "Polo in maglia", categorie: "maglieria top", foto: ["Polo_in_maglia_still.webp", "Polo_in_maglia.webp"] },
  { id: "top-in-maglia-con-bottoncini", nome: "Top in maglia con bottoncini", categorie: "maglieria top", foto: ["Top_in_maglia_con_bottoncini_still.webp", "Top_in_maglia_con_bottoncini.webp"] },
  { id: "cardigan-rigato-con-polsini-a-balza", nome: "Cardigan rigato con polsini a balza", categorie: "maglieria top", foto: ["Cardigan_rigato_con_polsini_a_balza.webp"] },
  { id: "cardigan-scollo-a-v-con-ricamo", nome: "Cardigan scollo a V con ricamo", categorie: "maglieria top", foto: ["Cardigan_scollo_a_V_con_ricamo.webp"] },
  { id: "cardigan-peplum-con-bottoni-gioiello", nome: "Cardigan peplum con bottoni gioiello", categorie: "maglieria top", foto: ["Cardigan_peplum_con_bottoni_gioiello.webp"] },
  { id: "cardigan-peplum-con-bottoni-rivestiti", nome: "Cardigan peplum con bottoni rivestiti", categorie: "maglieria top", foto: ["Cardigan_peplum_con_bottoni_rivestiti.webp"] },
  { id: "gonna-svasata-a-coste", nome: "Gonna svasata a coste", categorie: "maglieria", foto: ["Gonna_svasata_a_coste.webp"] },
  { id: "gonna-longuette-in-maglia", nome: "Gonna longuette in maglia", categorie: "maglieria", foto: ["Gonna_longuette_in_maglia.webp"] },
  { id: "cardigan-incrociato", nome: "Cardigan incrociato", categorie: "maglieria top", foto: ["Cardigan_incrociato.webp"] },
  { id: "maglia-con-collana-gioiello-e-cintura", nome: "Maglia con collana gioiello e cintura", categorie: "maglieria top", foto: ["Maglia_con_collana_gioiello_e_cintura.webp"] },
  { id: "maglia-scollo-quadro-con-bottoni-gioiello", nome: "Maglia scollo quadro con bottoni gioiello", categorie: "maglieria top", foto: ["Maglia_scollo_quadro_con_bottoni_gioiello.webp"] },
  { id: "maglia-collo-alto-con-fiocco", nome: "Maglia collo alto con fiocco", categorie: "maglieria top", foto: ["Maglia_collo_alto_con_fiocco.webp"] },
  { id: "tuta-set", nome: "Tuta set", categorie: "pantaloni top", foto: ["Tuta_set.webp"] },
];
