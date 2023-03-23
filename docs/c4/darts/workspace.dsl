workspace {
    model {
        !include ../hmcts.mdsl

        citizen = person "Citizen" "A citizen user"

        citizen -> darts_portal "Uses"

        # darts_portal -> darts_api "Uses"
    }

    views {
        !include ../hmcts.vdsl

        systemContext darts "darts-context" {
            include *
            exclude idam
            exclude rpe
            exclude relationship==bsp->*
            autoLayout
        }

        container darts "darts-overview" {
            include *
            exclude idam
            exclude rpe
            exclude relationship==bsp->*
            autoLayout
        }

        container darts "darts-citizen" {
            include *
            exclude idam
            exclude rpe
            exclude bsp
            autoLayout
        }

    }

}
