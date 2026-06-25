const db = require('../config/db');
const fs = require('fs');

// GET ALL
exports.getBanners = (req, res) => {
    const sql = "SELECT * FROM banners ORDER BY id DESC";

    db.query(sql, (err, result) => {
        if (err) return res.json(err);

        const data = result.map(item => ({
            id: item.id,
            title: item.title,
            image: `http://192.168.1.3:8000/uploads/banner/${item.image}`
        }));

        res.json(data);
    });
};

// ADD BANNER
exports.addBanner = (req, res) => {
    const title = req.body.title;
    const image = req.file.filename;

    const sql =
        "INSERT INTO banners (title, image) VALUES (?, ?)";

    db.query(sql, [title, image], (err, result) => {
        if (err) return res.json(err);

        res.json({
            message: "Banner berhasil ditambahkan"
        });
    });
};

// DELETE
exports.deleteBanner = (req, res) => {
    const id = req.params.id;

    const sql = "SELECT * FROM banners WHERE id=?";

    db.query(sql, [id], (err, result) => {
        if (err) return res.json(err);

        if (result.length > 0) {
            const imagePath =
                `uploads/banner/${result[0].image}`;

            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }

        db.query(
            "DELETE FROM banners WHERE id=?",
            [id],
            (err2, result2) => {
                if (err2) return res.json(err2);

                res.json({
                    message: "Banner berhasil dihapus"
                });
            }
        );
    });
};