Bring the guests and past visits from your current system into Placemat. You preview the import first, apply it only when you have checked it, and can undo it. Moving in is for the owner.

## What you can bring

A CSV of guests and their past visits, with these columns:

```csv
guest_id,name,email,phone,notes,visit_date,party_size,visit_status
```

Each row is a guest, optionally with one past visit. Rows with the same `guest_id` are combined into one guest with all their visits. Placemat ships an example file, `fixtures/tablein-guests.csv`, with invented guests.

The columns follow the shape of a Tablein guest export, but the importer has only been tested with invented data, not a real export: check the preview carefully. Past visits become history only. Placemat never creates future reservations from an import and never assumes marketing consent. The [CSV format](MOVE-IN.md) gives every rule and limit; one file can hold up to 100 rows.

## Preview

Open **Move in**, choose the CSV file and press **Preview import**. Nothing is written yet. **Import preview** shows the counts, any problems found in particular rows, and the guests as they will be imported.

If the preview reports errors, fix the file and preview it again.

## Apply

When the preview is right, tick **I reviewed this plan and want to import these records.** and press **Apply reviewed import**. Placemat imports exactly the plan you reviewed. It never overwrites a guest who is already in Placemat.

## Undo

Expand **Import journal & undo** and press **Load import journal**. Each import is listed with its state. **View journal** shows its details; **Review undo** opens the undo for that import. Type `UNDO` and press **Undo import** to remove the records that import added.

If someone has edited an imported guest since, for example by adding notes, the undo stops rather than lose that edit.
