const express = require('express');
const bcrypt = require('bcryptjs');
const { Op } = require (`sequelize`);

const { setTokenCookie, requireAuth } = require('../../utils/auth');
const { User, Spot, Review} = require('../../db/models');
const { ReviewImage, SpotImage, Booking } = require (`../../db/models`)
const { AggregateError } = require('sequelize');
const { check } = require('express-validator');
const { handleValidationErrors } = require('../../utils/validation');

const validateDatesInput = [
    check('startDate')
        .exists({ checkFalsy: true })
        .notEmpty()
        .custom((value) => {
            const today = new Date();
            const selectedStartDate = new Date(value);
            if (selectedStartDate < today) {
                throw new Error('startDate cannot be in the past');
            }
            return true;
        }),
    check('endDate')
        .exists({ checkFalsy: true })
        .notEmpty()
        .custom((value, { req }) => {
            const selectedStartDate = new Date(req.body.startDate);
            const selectedEndDate = new Date(value);
            if (selectedEndDate <= selectedStartDate) {
                throw new Error('endDate cannot be on or before startDate');
            }
            return true;
        }),
    handleValidationErrors
];

const router = express.Router()

//### Get all of the Current User's Bookings

router.get(`/current`, requireAuth, async (req, res, next) => {

    const userId = req.user.id;

    try {
        const bookings = await Booking.findAll({
            where: { userId },
            include: [
                {model: Spot, attributes: { exclude: [`description`, `createdAt`, `updatedAt`]},
                                            include: [{
                                                model: SpotImage,
                                                attributes: [`url`],
                                            }]
                }
            ]
        });

        let bookingsList = [];
        bookings.forEach(booking => {
            bookingsList.push(booking.toJSON())
        })

        bookingsList.forEach(booking => {
            
            booking.Spot.previewImage = booking.Spot.SpotImages[0].url;

        delete booking.Spot.SpotImages;
        });

        res.status(200).json({Bookings: bookingsList});
    } catch (error) {
        const err = new Error(`Booking couldn't be found`);
        err.status = 404;
        return next(err);
    }
});


//### Edit a Booking
router.put(`/:bookingId`, requireAuth, validateDatesInput,  async (req, res, next) => {
    const bookingId = req.params.bookingId;
    const userId = req.user.id;
    const {startDate, endDate} = req.body

    const bookingSelected = await Booking.findByPk(bookingId)

    //check to see if the booking is found
    if(!bookingSelected) {res.status(404).json({message: `Booking couldn't be found`})}

    const selectedStartDate = new Date(startDate);
    const selectedEndDate = new Date(endDate);

    //check if the current booking belongs to current user
    if(bookingSelected.userId !== userId) {return res.status(403).json({message: `Forbidden`})}


    //check to see if the selected booking. StartDate is in the past
    const today = new Date();
    const bookingSelectedStartDate = new Date(bookingSelected.startDate)

    if (bookingSelectedStartDate < today) {return res.status(403).json({message: `Past bookings can't be modified`})}

    //checking for booking conflict
    const spotId = bookingSelected.spotId

    //find all existing bookings by spotId. Not INCLUDING the current Book selected!!!!!
    const existingBookings = await Booking.findAll({where : {spotId, id: {[Op.not]: bookingSelected.id}}}, )

    //loop through all existing booking to check if the new booking dates conflict with any of them.
    for (const existingBooking of existingBookings) {
        const existingStartDate = new Date(existingBooking.startDate);
        const existingEndDate = new Date(existingBooking.endDate);

        // if (
        //     //if new startDate is before current EndDate && new startDate after current startDate - startDate Error
        //     (selectedStartDate <= existingEndDate && selectedStartDate >= existingStartDate) ||
        //     //if new endDate is after current startDate && new endDate is before current endDate - endDate Error
        //     (selectedEndDate >= existingStartDate && selectedEndDate <= existingEndDate) ||
        //     //if new startDate is before current StartDate && new endDate is after current endDate - endDate and startDate Erorr
        //     (selectedStartDate <= existingStartDate && selectedEndDate >= existingEndDate)
        // ){
        //     return res.status(403).json({
        //         message: "Sorry, this spot is already booked for the specified dates",
        //         errors: {
        //             "startDate": "Start date conflicts with an existing booking",
        //             "endDate": "End date conflicts with an existing booking"
        //         }
        //     });
        // }

        //if new startDate is before current StartDate && new endDate is after current endDate - endDate and startDate within Erorr
        if(selectedStartDate >= existingStartDate && selectedEndDate <= existingEndDate) {
        return res.status(403).json({
        message: "Sorry, this spot is already booked for the specified dates",
        errors: {
            "endDate": "End date conflicts with an existing booking",
            "startDate": "Start date conflicts with an existing booking"
            }
        });
        }
        //if new startDate is before current EndDate && new startDate after current startDate - startDate Error
        if(selectedStartDate <= existingEndDate && selectedStartDate >= existingStartDate) {
            return res.status(403).json({
            message: "Sorry, this spot is already booked for the specified dates",
            errors: {
                "startDate": "Start date conflicts with an existing booking",
                }
            });
        }
        //if new endDate is after current startDate && new endDate is before current endDate - endDate Error
        if(selectedEndDate >= existingStartDate && selectedEndDate <= existingEndDate) {
            return res.status(403).json({
            message: "Sorry, this spot is already booked for the specified dates",
            errors: {
                "endDate": "End date conflicts with an existing booking",
                }
            });
        }
        //if new startDate is before current StartDate && new endDate is after current endDate - endDate and startDate surrounding Erorr
        if(selectedStartDate <= existingStartDate && selectedEndDate >= existingEndDate) {
            return res.status(403).json({
            message: "Sorry, this spot is already booked for the specified dates",
            errors: {
                "endDate": "End date conflicts with an existing booking",
                "startDate": "Start date conflicts with an existing booking"
                }
            });
        }
    }
    //set new Booking Date one all tests above are passed
    bookingSelected.set({
        startDate,
        endDate
    });
    await bookingSelected.save()
    return res.status(200).json(bookingSelected);

});

//### Delete a Booking
router.delete(`/:bookingId`, requireAuth,  async (req, res, next) => {
    const bookingId = req.params.bookingId;
    const userId = req.user.id;
    const bookingSelected = await Booking.findByPk(bookingId);

    //check to see if the booking exist
     if(!bookingSelected) {res.status(404).json({message: `Booking couldn't be found`})}

    //check if booking selected's belongs to current user or bookingselected spotId belongs to current user.
    const spotId = bookingSelected.spotId;
    const spotSelected = await Spot.findByPk(spotId);
    if (bookingSelected.userId !== userId && spotSelected.ownerId !== userId) {
        // console.log(`current Booking userId`, bookingSelected.userId)
        // console.log(`login userId`, userId)
        // console.log(`ownerId`, spotSelected.ownerId)
        return res.status(403).json({message: `Forbidden`}
        )
    }

    //check to see if today's date is within the booking startDate and endDate
    const today = new Date ();
    const bookingWithinToday = await Booking.findOne( {
        where: {
            startDate: { [Op.lte]: today },
            endDate: { [Op.gte]: today },
            id: bookingId
        }
    })
    //console.log(bookingWithinToday)
    if(bookingWithinToday) {return res.status(403).json({message: `Bookings that have been started can't be deleted`})}

    await bookingSelected.destroy();

    return res.status(200).json({message: `Successfully deleted`});
});

module.exports = router;
