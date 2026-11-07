"""Run real local inference on synthetic fixtures. This is not an accuracy benchmark."""

import json
import time

from engine import Detector

samples = {
    "en": """The research team measured rainfall at three locations near the river. Each
    station recorded the water level every morning for six weeks. The first station
    was beside a bridge, while the second was near the school and the third stood
    downstream. Researchers checked the instruments before each measurement and
    wrote the readings in a shared notebook. Some observations were missing because
    a road was flooded. The final report describes those gaps and compares the
    remaining observations without replacing missing readings with invented values.
    Local residents also described changes they had noticed during the previous year.""",
    "fr": """L'équipe de recherche a mesuré les précipitations à trois endroits près
    de la rivière. Chaque station enregistrait le niveau de l'eau chaque matin
    pendant six semaines. La première station se trouvait près du pont, la deuxième
    près de l'école et la troisième en aval. Les chercheurs vérifiaient les appareils
    avant chaque mesure et notaient les résultats dans un cahier commun. Certaines
    observations manquent parce que la route était inondée. Le rapport décrit ces
    lacunes et compare les observations disponibles sans inventer les valeurs manquantes.
    Les habitants ont également décrit les changements observés pendant l'année précédente.""",
}

started = time.monotonic()
detector = Detector()
print(json.dumps({"model_loaded_seconds": round(time.monotonic() - started, 2)}), flush=True)
for language, text in samples.items():
    started = time.monotonic()
    output = detector.detect(text)
    assert output["status"] == "complete"
    assert 0 <= output["aiScore"] <= 1
    assert detector.detect(text)["aiScore"] == output["aiScore"]
    print(json.dumps({"language": language, "score": output["aiScore"], "segments": output["segmentCount"],
                      "seconds": round(time.monotonic() - started, 2)}), flush=True)
long_output = detector.detect(samples["fr"] * 5)
assert long_output["segmentCount"] > 1
assert long_output["characterCount"] == len(samples["fr"] * 5)
assert detector.detect("Un texte court.")["aiScore"] is None
print(json.dumps({"long_document_segments": long_output["segmentCount"], "short_text": "unavailable"}), flush=True)
