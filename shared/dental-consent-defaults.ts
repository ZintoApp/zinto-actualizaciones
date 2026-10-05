import type { ConsentTemplate } from './dental-consent';

const acknowledgment = {
  en: `ACKNOWLEDGMENT AND AUTHORIZATION
I, {{patientName}}, have discussed the proposed treatment with {{professionalName}}. I have disclosed my medical conditions, medicines, allergies and any possible pregnancy. The professional has explained the intended benefits, material risks, alternatives and consequences of declining treatment in language I understand. I have had the opportunity to ask questions and have received answers. Results cannot be guaranteed.
I understand that I can decline treatment or withdraw consent before the procedure. If an unexpected finding changes the proposed treatment, further options and consent will be discussed when circumstances allow. I authorize the procedure described above, with the agreed anesthesia where applicable.
Consent date: {{consentDate}}. Guardian, when applicable: {{guardianName}}.`,
  es: `DECLARACIÓN Y AUTORIZACIÓN
Yo, {{patientName}}, he conversado sobre el tratamiento propuesto con {{professionalName}}. He informado sobre mis enfermedades, medicamentos, alergias y posible embarazo. El profesional me ha explicado los beneficios esperados, los riesgos relevantes, las alternativas y las consecuencias de no tratarme, en un lenguaje que comprendo. He podido hacer preguntas y he recibido respuestas. Entiendo que no se garantizan resultados.
Entiendo que puedo rechazar el tratamiento o retirar mi consentimiento antes del procedimiento. Si un hallazgo inesperado modifica el tratamiento propuesto, se explicarán las opciones y se solicitará el consentimiento adicional cuando las circunstancias lo permitan. Autorizo el procedimiento descrito, con la anestesia acordada cuando corresponda.
Fecha del consentimiento: {{consentDate}}. Acudiente, cuando corresponda: {{guardianName}}.`,
};

function form(key: string, enTitle: string, esTitle: string, en: string, es: string): ConsentTemplate {
  const declaration = key === 'pediatric' ? {
    en: `PARENT OR GUARDIAN ACKNOWLEDGMENT AND AUTHORIZATION
I, {{guardianName}}, am the parent or legal guardian authorized to consent for {{patientName}}. I have discussed the proposed care with {{professionalName}} and disclosed the child's medical conditions, medicines and allergies. The benefits, material risks, alternatives and consequences of declining treatment have been explained in language I understand. My questions have been answered. Results cannot be guaranteed.
I understand that I may decline treatment or withdraw consent before the procedure. Any material change in the agreed care will be discussed and additional consent sought when circumstances allow. I authorize the care described above for the child, with the agreed local anesthesia where applicable.
Consent date: {{consentDate}}.`,
    es: `DECLARACIÓN Y AUTORIZACIÓN DEL PADRE, MADRE O REPRESENTANTE LEGAL
Yo, {{guardianName}}, soy el padre, la madre o el representante legal autorizado para consentir por {{patientName}}. He conversado sobre la atención propuesta con {{professionalName}} y he informado sobre las enfermedades, medicamentos y alergias del menor. Se me han explicado los beneficios, riesgos relevantes, alternativas y consecuencias de no tratar en un lenguaje que comprendo. Mis preguntas han sido respondidas. No se garantizan resultados.
Entiendo que puedo rechazar el tratamiento o retirar mi consentimiento antes del procedimiento. Los cambios relevantes en la atención acordada se explicarán y se solicitará consentimiento adicional cuando las circunstancias lo permitan. Autorizo la atención descrita para el menor, con la anestesia local acordada cuando corresponda.
Fecha del consentimiento: {{consentDate}}.`,
  } : acknowledgment;
  return { key, isBuiltIn: true, isActive: true, updatedAt: null, translations: {
    en: { title: enTitle, body: `${en}\n\n${declaration.en}` },
    es: { title: esTitle, body: `${es}\n\n${declaration.es}` },
  } };
}

const denture = (arch: 'complete' | 'upper' | 'lower') => {
  const en = { complete: 'the upper and lower arches', upper: 'the upper arch', lower: 'the lower arch' }[arch];
  const es = { complete: 'las arcadas superior e inferior', upper: 'la arcada superior', lower: 'la arcada inferior' }[arch];
  return form(`dentures-${arch}`,
    { complete: 'Complete mucosa-supported dentures', upper: 'Upper-arch mucosa-supported denture', lower: 'Lower-arch mucosa-supported denture' }[arch],
    { complete: 'Prótesis total mucosoportada', upper: 'Prótesis mucosoportada superior', lower: 'Prótesis mucosoportada inferior' }[arch],
    `PROPOSED TREATMENT
Fabrication, insertion and adjustment of removable dentures for ${en}, supported by the oral tissues, to replace missing teeth and improve appearance, speech and chewing. Impressions and bite records are taken, and trial fittings may be needed. Preparatory treatment or local anesthesia, if necessary, will be explained separately.

RISKS AND LIMITATIONS
1. Adaptation may involve sore areas, increased saliva, gagging, altered speech and difficulty chewing. Adjustments are often necessary.
2. Retention depends on the shape of the jaws, saliva and tissue support. Dentures can move during eating or speaking; lower dentures often have less stability. They do not restore the function of natural teeth.
3. Tissue irritation, fungal infection, material sensitivity, fracture or wear may occur. Bone and gum changes can loosen the fit over time.

ALTERNATIVES AND FOLLOW-UP
Alternatives may include implant-supported options, other suitable prostheses or no replacement, depending on clinical findings and cost. Leaving teeth unreplaced can affect function and appearance. I will attend adjustments, clean the dentures and oral tissues daily, remove the dentures as instructed, and avoid adjusting them myself. Regular reviews, relining or replacement may be necessary. Persistent ulcers, pain or inability to use the denture require review.`,
    `TRATAMIENTO PROPUESTO
Elaboración, inserción y adaptación de prótesis removibles para ${es}, apoyadas en los tejidos orales, para reemplazar dientes ausentes y mejorar la apariencia, el habla y la masticación. Se tomarán impresiones y registros de mordida, y pueden requerirse pruebas. Si se necesita tratamiento preparatorio o anestesia local, se explicará por separado.

RIESGOS Y LIMITACIONES
1. La adaptación puede causar zonas dolorosas, aumento de saliva, náuseas, cambios en el habla y dificultad al masticar. Suelen necesitarse ajustes.
2. La retención depende de los maxilares, la saliva y el soporte de los tejidos. La prótesis puede moverse al comer o hablar; las inferiores suelen ser menos estables. No recuperan la función de los dientes naturales.
3. Pueden presentarse irritación, infección por hongos, sensibilidad a materiales, fractura o desgaste. Los cambios del hueso y la encía pueden disminuir el ajuste con el tiempo.

ALTERNATIVAS Y SEGUIMIENTO
Según los hallazgos clínicos y el costo, las alternativas pueden incluir prótesis sobre implantes, otras prótesis adecuadas o no reemplazar los dientes. La ausencia de reemplazo puede afectar la función y la apariencia. Asistiré a los ajustes, limpiaré diariamente las prótesis y los tejidos orales, las retiraré según las indicaciones y no las modificaré por mi cuenta. Pueden necesitarse controles, rebases o reemplazos. Las úlceras persistentes, el dolor o la imposibilidad de usar la prótesis requieren revisión.`);
};

export const DEFAULT_CONSENT_TEMPLATES: ConsentTemplate[] = [
  form('root-canal', 'Root canal treatment', 'Endodoncia',
    `PROPOSED TREATMENT
Removal of inflamed or infected pulp, cleaning and shaping of the root canals, disinfection and sealing to retain the tooth. Local anesthesia and one or more visits may be required. A temporary restoration may be placed between visits. A definitive restoration, sometimes including a crown, is normally needed afterward and is a separate treatment.

RISKS AND LIMITATIONS
1. Pain, swelling, infection or a flare-up can occur during or after treatment and may require additional care.
2. Narrow, curved or calcified canals may prevent complete treatment. Instruments may separate; perforation, root fracture or extrusion of filling material or irrigant can occur.
3. Persistent infection may require retreatment, root-end surgery or extraction. Tooth discoloration and fracture are possible. Local anesthesia can cause temporary numbness, bruising or an adverse reaction; prolonged altered sensation is uncommon.

ALTERNATIVES AND AFTERCARE
Alternatives include extraction with or without replacement, or no treatment. Untreated disease can cause pain, spreading infection and tooth loss. I will avoid chewing on the tooth until it is restored, complete the definitive restoration promptly, follow medication instructions and attend reviews. Increasing swelling, fever, uncontrolled pain, or difficulty swallowing or breathing requires urgent assessment.`,
    `TRATAMIENTO PROPUESTO
Retiro de la pulpa inflamada o infectada, limpieza, conformación, desinfección y sellado de los conductos para conservar el diente. Pueden requerirse anestesia local y varias citas. Puede colocarse una restauración provisional entre citas. Después suele necesitarse una restauración definitiva, a veces una corona, que constituye un tratamiento adicional.

RIESGOS Y LIMITACIONES
1. Durante o después del tratamiento pueden aparecer dolor, inflamación, infección o agudización que requieran atención adicional.
2. Los conductos estrechos, curvos o calcificados pueden impedir completar el tratamiento. Pueden ocurrir separación de instrumentos, perforación, fractura radicular o salida de material de obturación o irrigante.
3. La infección persistente puede requerir retratamiento, cirugía apical o extracción. Son posibles el cambio de color y la fractura dental. La anestesia local puede causar adormecimiento temporal, hematoma o reacción adversa; la alteración prolongada de la sensibilidad es poco frecuente.

ALTERNATIVAS Y CUIDADOS
Las alternativas incluyen extracción con o sin reemplazo, o no tratar. La enfermedad sin tratamiento puede causar dolor, infección extendida y pérdida del diente. Evitaré masticar con el diente hasta restaurarlo, completaré pronto la restauración definitiva, seguiré las indicaciones y asistiré a controles. La inflamación creciente, fiebre, dolor no controlado o dificultad para tragar o respirar requieren valoración urgente.`),
  form('extraction', 'Dental extraction', 'Exodoncia',
    `PROPOSED TREATMENT
Removal of a tooth that cannot reasonably be retained or whose removal is indicated in the agreed treatment plan. Local anesthesia is normally used. The tooth may need to be divided; a gum incision, limited bone removal or stitches may be necessary if a straightforward extraction is not possible.

RISKS AND LIMITATIONS
1. Pain, swelling, bruising, bleeding, infection, dry socket and limited mouth opening can occur.
2. Adjacent teeth or restorations may be damaged. Roots can fracture; a fragment may require further surgery or, when safer, be left after discussion and follow-up.
3. Upper tooth removal may create an opening into the sinus. Lower tooth removal can affect nerves, causing temporary or occasionally persistent altered sensation in the lip, chin or tongue. Jaw fracture is rare. Anesthetic reactions are possible.

ALTERNATIVES AND AFTERCARE
Where feasible, alternatives include restoration, root canal or periodontal treatment, or monitoring. No treatment may allow pain or infection to progress. Replacement options and their costs can be discussed separately. I will follow the written instructions on pressure, hygiene, diet, smoking and medicines. Persistent bleeding, worsening swelling, fever, or difficulty swallowing or breathing requires urgent assessment.`,
    `TRATAMIENTO PROPUESTO
Retiro de un diente que no puede conservarse razonablemente o cuya extracción está indicada en el plan acordado. Generalmente se utiliza anestesia local. Puede requerirse dividir el diente, hacer una incisión, retirar una pequeña cantidad de hueso o colocar suturas si la extracción simple no es posible.

RIESGOS Y LIMITACIONES
1. Pueden presentarse dolor, inflamación, hematomas, sangrado, infección, alveolitis y limitación de la apertura bucal.
2. Pueden dañarse dientes o restauraciones vecinas. Una raíz puede fracturarse y requerir cirugía adicional o, si es más seguro, dejarse tras explicarlo y acordar seguimiento.
3. La extracción superior puede comunicar con el seno maxilar. La extracción inferior puede afectar nervios y causar alteración temporal o, en ocasiones, persistente de la sensibilidad del labio, mentón o lengua. La fractura mandibular es rara. Son posibles reacciones a la anestesia.

ALTERNATIVAS Y CUIDADOS
Cuando sean viables, las alternativas incluyen restauración, endodoncia, tratamiento periodontal o vigilancia. No tratar puede permitir que progresen el dolor o la infección. Las opciones de reemplazo y sus costos se explicarán por separado. Seguiré las instrucciones de presión, higiene, alimentación, tabaco y medicamentos. El sangrado persistente, la inflamación creciente, fiebre o dificultad para tragar o respirar requieren valoración urgente.`),
  form('impacted-extraction', 'Surgical extraction of an impacted tooth', 'Exodoncia quirúrgica de diente incluido',
    `PROPOSED TREATMENT
Surgical removal of an impacted or unerupted tooth after clinical and radiographic assessment. Treatment may involve local anesthesia, a gum incision, bone removal, division of the tooth and sutures. Any sedation requires a separate discussion and consent.

RISKS AND LIMITATIONS
1. Pain, swelling, bruising, bleeding, infection, dry socket and reduced mouth opening may occur.
2. Nearby teeth, restorations or bone may be damaged. Root fragments can require further surgery or be left when removal carries greater risk, with explanation and follow-up.
3. Depending on tooth position, nerves to the lip, chin or tongue may be affected, causing temporary or permanent altered sensation or taste. Upper teeth may communicate with the sinus. Jaw fracture, displacement of a tooth fragment and anesthetic reactions are possible.

ALTERNATIVES AND AFTERCARE
Alternatives can include monitoring, another surgical approach or coronectomy in selected lower wisdom teeth. The professional will explain the risks of retaining the tooth, including infection, decay or damage to adjacent structures. I will follow surgical aftercare, avoid smoking and disturbing the wound, take medicines as directed and attend review or suture removal. Persistent bleeding, fever, worsening swelling or difficulty swallowing or breathing requires urgent care.`,
    `TRATAMIENTO PROPUESTO
Retiro quirúrgico de un diente incluido o no erupcionado después de la valoración clínica y radiográfica. Puede requerir anestesia local, incisión de encía, retiro de hueso, división del diente y suturas. La sedación requiere explicación y consentimiento separados.

RIESGOS Y LIMITACIONES
1. Pueden presentarse dolor, inflamación, hematomas, sangrado, infección, alveolitis y menor apertura bucal.
2. Pueden dañarse dientes, restauraciones o hueso vecinos. Los fragmentos radiculares pueden requerir otra cirugía o dejarse si retirarlos implica mayor riesgo, con explicación y seguimiento.
3. Según la posición dental, pueden afectarse los nervios del labio, mentón o lengua, causando cambios temporales o permanentes de sensibilidad o gusto. Los dientes superiores pueden comunicar con el seno maxilar. Son posibles fractura mandibular, desplazamiento de fragmentos y reacciones anestésicas.

ALTERNATIVAS Y CUIDADOS
Las alternativas pueden incluir vigilancia, otro abordaje quirúrgico o coronectomía en algunos terceros molares inferiores. Se explicarán los riesgos de conservar el diente, como infección, caries o daño de estructuras vecinas. Seguiré los cuidados, evitaré fumar y manipular la herida, tomaré los medicamentos indicados y asistiré a revisión o retiro de suturas. El sangrado persistente, fiebre, inflamación creciente o dificultad para tragar o respirar requieren atención urgente.`),
  form('oral-lesion', 'Excision of a benign oral mucosal lesion', 'Resección de lesión benigna de mucosa oral',
    `PROPOSED TREATMENT
Removal of a lesion believed clinically to be benign, under local anesthesia, for treatment and/or diagnosis. The tissue may be sent for histopathological examination. A clinical impression does not establish the final diagnosis; the result may require further investigation or treatment. Sutures may be needed.

RISKS AND LIMITATIONS
1. Pain, swelling, bleeding, infection, delayed healing and scar formation may occur.
2. Depending on the site, nearby nerves, salivary ducts or other structures may be injured, changing sensation or function.
3. The lesion can recur or may not be completely removed. Laboratory findings may differ from the initial impression and may lead to referral or additional surgery. Local anesthetic reactions are possible.

ALTERNATIVES AND AFTERCARE
Depending on the findings, alternatives include observation, treatment of an underlying irritant, a smaller diagnostic biopsy or referral. Delaying diagnosis may delay appropriate treatment. I will protect and clean the site as instructed and attend the review to discuss laboratory results, even if the wound feels healed. Persistent bleeding, increasing swelling, fever or swallowing/breathing difficulty requires urgent assessment.`,
    `TRATAMIENTO PROPUESTO
Retiro de una lesión considerada clínicamente benigna, bajo anestesia local, para tratarla y/o establecer su diagnóstico. El tejido puede enviarse a estudio histopatológico. La impresión clínica no determina el diagnóstico definitivo; el resultado puede requerir otros estudios o tratamientos. Pueden necesitarse suturas.

RIESGOS Y LIMITACIONES
1. Pueden presentarse dolor, inflamación, sangrado, infección, cicatrización lenta y formación de cicatriz.
2. Según la ubicación, pueden lesionarse nervios, conductos salivales u otras estructuras cercanas, con cambios de sensibilidad o función.
3. La lesión puede reaparecer o no retirarse completamente. El resultado del laboratorio puede diferir de la impresión inicial y requerir remisión o nueva cirugía. Son posibles reacciones a la anestesia local.

ALTERNATIVAS Y CUIDADOS
Según los hallazgos, las alternativas incluyen vigilancia, eliminar un irritante, una biopsia diagnóstica menor o remisión. Retrasar el diagnóstico puede demorar el tratamiento adecuado. Cuidaré y limpiaré la zona según las indicaciones y asistiré a la revisión de los resultados, aunque la herida parezca curada. El sangrado persistente, inflamación creciente, fiebre o dificultad para tragar o respirar requieren valoración urgente.`),
  form('frenectomy', 'Frenectomy', 'Frenilectomía',
    `PROPOSED TREATMENT
Release or removal of restrictive lip or tongue frenum tissue to address the assessed functional or periodontal problem. The professional will explain the site, technique and expected benefit. Local anesthesia and sutures may be used. Improvement in speech, feeding or tooth position cannot be guaranteed and may require additional therapy.

RISKS AND LIMITATIONS
1. Pain, swelling, bleeding, infection and delayed healing may occur.
2. Scarring or reattachment can restrict movement again and may require further treatment.
3. Depending on the site, altered sensation, injury to salivary ducts or nearby structures, and changes in lip or tongue movement may occur. Anesthetic reactions are possible.

ALTERNATIVES AND AFTERCARE
Alternatives may include observation, feeding or speech assessment, functional therapy or another surgical technique. No treatment may leave the functional restriction unchanged. I will follow the prescribed hygiene, diet and individualized movement or exercise instructions, without forcing the wound, and attend review. Uncontrolled bleeding, progressive swelling, fever or difficulty swallowing or breathing requires urgent care.`,
    `TRATAMIENTO PROPUESTO
Liberación o retiro de tejido restrictivo del frenillo labial o lingual para tratar el problema funcional o periodontal identificado. Se explicarán la zona, técnica y beneficio esperado. Pueden utilizarse anestesia local y suturas. No se garantiza mejorar el habla, la alimentación o la posición dental, y pueden necesitarse terapias adicionales.

RIESGOS Y LIMITACIONES
1. Pueden presentarse dolor, inflamación, sangrado, infección y cicatrización lenta.
2. La cicatriz o reinserción del tejido puede limitar nuevamente el movimiento y requerir otro tratamiento.
3. Según la zona, pueden ocurrir cambios de sensibilidad, lesión de conductos salivales o estructuras cercanas y cambios de movimiento del labio o lengua. Son posibles reacciones anestésicas.

ALTERNATIVAS Y CUIDADOS
Las alternativas pueden incluir vigilancia, valoración de alimentación o habla, terapia funcional u otra técnica quirúrgica. No tratar puede mantener la restricción funcional. Seguiré las indicaciones de higiene, dieta y ejercicios individualizados sin forzar la herida, y asistiré al control. El sangrado no controlado, inflamación progresiva, fiebre o dificultad para tragar o respirar requieren atención urgente.`),
  form('scaling', 'Dental scaling', 'Detartraje dental',
    `PROPOSED TREATMENT
Removal of plaque and calculus with hand and/or ultrasonic instruments to reduce gum inflammation and help maintain oral health. The extent of cleaning and any need for local anesthesia will be explained. Deeper periodontal disease may require separate root surface treatment or further care.

RISKS AND LIMITATIONS
1. Temporary tooth sensitivity, gum tenderness, bleeding and irritation may occur.
2. Removal of deposits and reduction of swelling can reveal existing gum recession, spaces between teeth or root surfaces.
3. Existing loose or defective restorations may become apparent or dislodge. Soft tissue injury and anesthetic reactions are possible. Scaling alone may not control advanced periodontal disease.

ALTERNATIVES AND AFTERCARE
Alternatives depend on the assessment and include periodontal therapy or referral. Home cleaning helps but does not remove established calculus; declining care may allow inflammation, bone loss and tooth loss to progress. I will maintain daily brushing and interdental cleaning, follow sensitivity and medication advice, and attend maintenance visits. Persistent pain, swelling or bleeding requires review.`,
    `TRATAMIENTO PROPUESTO
Eliminación de placa y cálculo con instrumentos manuales y/o ultrasónicos para reducir la inflamación gingival y mantener la salud oral. Se explicarán el alcance de la limpieza y la necesidad de anestesia local. La enfermedad periodontal profunda puede requerir tratamiento radicular u otra atención por separado.

RIESGOS Y LIMITACIONES
1. Pueden presentarse sensibilidad dental, dolor gingival, sangrado e irritación temporales.
2. Retirar los depósitos y reducir la inflamación puede hacer visibles recesiones, espacios entre dientes o superficies radiculares previamente existentes.
3. Pueden detectarse o desprenderse restauraciones flojas o defectuosas. Son posibles lesiones de tejidos blandos y reacciones anestésicas. El detartraje solo puede ser insuficiente para enfermedad periodontal avanzada.

ALTERNATIVAS Y CUIDADOS
Según la valoración, las alternativas incluyen terapia periodontal o remisión. La limpieza en casa ayuda, pero no elimina el cálculo establecido; rechazar la atención puede permitir que progresen inflamación, pérdida ósea y pérdida dental. Mantendré cepillado y limpieza interdental diarios, seguiré las indicaciones y asistiré al mantenimiento. El dolor, inflamación o sangrado persistentes requieren revisión.`),
  form('pediatric', 'Pediatric dentistry', 'Odontopediatría',
    `PROPOSED TREATMENT
Dental care for the child named on this form, as explained to the parent or guardian, {{guardianName}}. The agreed care may include prevention, restorations and management of primary teeth to preserve comfort, chewing and healthy development. The individual procedures and affected teeth must be discussed before treatment. Extractions, pulp therapy or sedation requiring specific consent will be explained separately.

RISKS AND LIMITATIONS
1. Discomfort, bleeding, sensitivity, restoration failure, recurrent decay and need for further care may occur.
2. Local anesthesia can cause temporary numbness, accidental lip or cheek biting and adverse reactions. The child needs supervision while numb.
3. Cooperation may limit treatment. Behavior support will be explained; this form does not authorize restraint or sedation. Early tooth loss can affect space for permanent teeth and may require a space maintainer.

ALTERNATIVES AND AFTERCARE
Depending on the condition, alternatives include preventive care, staged treatment, other restorative options or specialist referral. Delay can allow pain, infection or damage to developing teeth. The guardian will supervise hygiene, diet and post-treatment care, attend reviews and seek advice for persistent pain, swelling or trauma. Fever, progressive swelling or difficulty swallowing or breathing requires urgent assessment.`,
    `TRATAMIENTO PROPUESTO
Atención dental del menor identificado en este formulario, explicada a su padre, madre o acudiente, {{guardianName}}. Puede incluir prevención, restauraciones y manejo de dientes temporales para conservar el bienestar, la masticación y el desarrollo saludable. Los procedimientos concretos y dientes afectados deben explicarse antes de tratar. Las extracciones, terapia pulpar o sedación que requieran consentimiento específico se explicarán por separado.

RIESGOS Y LIMITACIONES
1. Pueden presentarse molestias, sangrado, sensibilidad, falla de restauraciones, nueva caries y necesidad de atención adicional.
2. La anestesia local puede causar adormecimiento temporal, mordedura accidental del labio o mejilla y reacciones adversas. El menor necesita supervisión mientras esté adormecido.
3. La colaboración puede limitar el tratamiento. Se explicará el apoyo conductual; este formulario no autoriza restricción física ni sedación. La pérdida temprana de dientes puede afectar el espacio de los permanentes y requerir un mantenedor.

ALTERNATIVAS Y CUIDADOS
Según el diagnóstico, las alternativas incluyen prevención, tratamiento por etapas, otras restauraciones o remisión. La demora puede permitir dolor, infección o daño de dientes en desarrollo. El acudiente supervisará higiene, alimentación y cuidados, asistirá a controles y consultará por dolor persistente, inflamación o trauma. La fiebre, inflamación progresiva o dificultad para tragar o respirar requieren valoración urgente.`),
  denture('complete'), denture('upper'), denture('lower'),
];
